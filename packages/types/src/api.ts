/** Response envelope returned by every API endpoint: { success, data, error, meta } */

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Field-level validation issues, when applicable. */
  details?: Array<{ path: string; message: string }>;
  requestId?: string;
}

export interface ApiSuccess<T, M = Record<string, unknown>> {
  success: true;
  data: T;
  error: null;
  meta: (M & Partial<PageMeta>) | null;
}

export interface ApiFailure {
  success: false;
  data: null;
  error: ApiErrorBody;
  meta: null;
}

export type ApiEnvelope<T, M = Record<string, unknown>> = ApiSuccess<T, M> | ApiFailure;

/** A list result as exposed by the typed client (data + page meta). */
export interface Paginated<T, M = Record<string, unknown>> {
  items: T[];
  meta: PageMeta & M;
}
