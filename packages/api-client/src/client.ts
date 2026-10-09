import type { ApiEnvelope, AuthResult, PageMeta, Paginated } from '@gk/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError() {
    return this.status === 401;
  }

  /** Field → message map for form validation errors. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

export interface TokenStore {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  /** Mobile only — web keeps the refresh token in an httpOnly cookie. */
  getRefreshToken?(): Promise<string | null> | string | null;
  setRefreshToken?(token: string | null): Promise<void> | void;
}

export interface ClientOptions {
  /** e.g. "/api/v1" (browser, same-origin via Next rewrite) or "http://localhost:4000/api/v1" */
  baseUrl: string;
  platform: 'web' | 'mobile';
  tokens: TokenStore;
  /** Guest cart id header (Redis cart) */
  getGuestCartId?: () => string | null;
  /** Called when the session can't be refreshed (user must sign in again). */
  onSessionExpired?: () => void;
  /** Called after a successful token refresh (e.g. to update the user in a store). */
  onAuthResult?: (result: AuthResult) => void;
  fetchImpl?: typeof fetch;
}

export type Query = Record<
  string,
  string | number | boolean | null | undefined | Array<string | number>
>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip attaching the access token. */
  anonymous?: boolean;
  /** Extra fetch init (e.g. Next.js `{ next: { revalidate: 60 } }`, AbortSignal). */
  init?: RequestInit & Record<string, unknown>;
  /** Internal: don't try to refresh on 401 (used by the refresh call itself). */
  noRefresh?: boolean;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    const value = Array.isArray(v) ? v.join(',') : String(v);
    if (value === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[$()*+./?[\\\]^{|}-]/g, '\\$&')}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1] as string) : null;
}

export class ApiClient {
  private refreshing: Promise<boolean> | null = null;
  private readonly doFetch: typeof fetch;

  constructor(readonly options: ClientOptions) {
    this.doFetch = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  private headers(opts: RequestOptions, hasJsonBody: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    };
    if (this.options.platform === 'mobile') h['X-Client-Type'] = 'mobile';
    const guest = this.options.getGuestCartId?.();
    if (guest) h['X-Guest-Cart-Id'] = guest;
    const token = this.options.tokens.getAccessToken();
    if (token && !opts.anonymous) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  private async send<T>(
    method: string,
    path: string,
    opts: RequestOptions,
  ): Promise<ApiEnvelope<T> & { status: number }> {
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const hasJson = opts.body !== undefined && !isForm;
    const res = await this.doFetch(`${this.options.baseUrl}${path}${buildQuery(opts.query)}`, {
      method,
      headers: this.headers(opts, hasJson),
      body:
        opts.body === undefined
          ? undefined
          : isForm
            ? (opts.body as FormData)
            : JSON.stringify(opts.body),
      credentials: this.options.platform === 'web' ? 'include' : 'omit',
      ...opts.init,
    });
    let json: ApiEnvelope<T>;
    try {
      json = (await res.json()) as ApiEnvelope<T>;
    } catch {
      json = {
        success: false,
        data: null,
        meta: null,
        error: { code: 'BAD_RESPONSE', message: `Unexpected response (${res.status})` },
      };
    }
    return Object.assign(json, { status: res.status });
  }

  /** Single-flight refresh: concurrent 401s share one refresh request. */
  async refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const { tokens, platform } = this.options;
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      let body: Record<string, string> = {};
      if (platform === 'mobile') {
        headers['X-Client-Type'] = 'mobile';
        const rt = await tokens.getRefreshToken?.();
        if (!rt) return false;
        body = { refreshToken: rt };
      } else {
        const csrf = readCookie('gk_csrf');
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const res = await this.doFetch(`${this.options.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: platform === 'web' ? 'include' : 'omit',
      });
      const json = (await res.json()) as ApiEnvelope<AuthResult>;
      if (!json.success) {
        tokens.setAccessToken(null);
        if (platform === 'mobile') await tokens.setRefreshToken?.(null);
        return false;
      }
      tokens.setAccessToken(json.data.accessToken);
      if (platform === 'mobile' && json.data.refreshToken)
        await tokens.setRefreshToken?.(json.data.refreshToken);
      this.options.onAuthResult?.(json.data);
      return true;
    } catch {
      return false;
    }
  }

  /** Low-level request returning data + meta; throws ApiError on failure. */
  async request<T, M = Record<string, unknown>>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<{ data: T; meta: (PageMeta & M) | null }> {
    let res = await this.send<T>(method, path, opts);
    // An expired access token is refreshed transparently once; the original request is then replayed.
    const expired = res.status === 401 && !res.success && res.error.code === 'TOKEN_EXPIRED';
    if (expired && !opts.noRefresh) {
      if (await this.refresh()) res = await this.send<T>(method, path, opts);
      else this.options.onSessionExpired?.();
    }
    if (!res.success)
      throw new ApiError(
        res.status,
        res.error.code,
        res.error.message,
        res.error.details,
        res.error.requestId,
      );
    return { data: res.data, meta: res.meta as (PageMeta & M) | null };
  }

  async get<T>(path: string, query?: Query, init?: RequestOptions['init']): Promise<T> {
    return (await this.request<T>('GET', path, { query, init })).data;
  }
  async post<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return (await this.request<T>('POST', path, { ...opts, body: body ?? {} })).data;
  }
  async put<T>(path: string, body?: unknown): Promise<T> {
    return (await this.request<T>('PUT', path, { body: body ?? {} })).data;
  }
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return (await this.request<T>('PATCH', path, { body: body ?? {} })).data;
  }
  async delete<T>(path: string, query?: Query): Promise<T> {
    return (await this.request<T>('DELETE', path, { query })).data;
  }

  /** GET a paginated endpoint → { items, meta }. */
  async paged<T, M = Record<string, unknown>>(
    path: string,
    query?: Query,
    init?: RequestOptions['init'],
  ): Promise<Paginated<T, M>> {
    const { data, meta } = await this.request<T[], M>('GET', path, { query, init });
    return {
      items: data,
      meta: (meta ?? {
        page: 1,
        limit: data.length,
        total: data.length,
        totalPages: 1,
        hasNext: false,
      }) as PageMeta & M,
    };
  }

  /** Download a binary response (PDF) with auth; returns a Blob (web). */
  async blob(path: string): Promise<Blob> {
    const doRequest = () =>
      this.doFetch(`${this.options.baseUrl}${path}`, {
        headers: this.headers({}, false),
        credentials: this.options.platform === 'web' ? 'include' : 'omit',
      });
    let res = await doRequest();
    if (res.status === 401 && (await this.refresh())) res = await doRequest();
    if (!res.ok) {
      let message = `Download failed (${res.status})`;
      try {
        message =
          ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        /* not json */
      }
      throw new ApiError(res.status, 'DOWNLOAD_FAILED', message);
    }
    return res.blob();
  }
}

export function createClient(options: ClientOptions): ApiClient {
  return new ApiClient(options);
}
