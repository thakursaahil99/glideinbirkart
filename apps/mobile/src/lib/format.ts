import { ApiError } from '@gk/api-client';
import { API_URL } from './config';

export { formatINR } from '@gk/utils';

const API_HOST = (() => {
  try {
    return new URL(API_URL).host;
  } catch {
    return null;
  }
})();

/**
 * The API stores absolute URLs built from API_PUBLIC_URL (localhost in dev), which a physical phone cannot reach.
 * Rewrite loopback hosts to the host the app is actually talking to.
 */
export function imageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (API_HOST && /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?\//.test(url)) {
    return url.replace(/^(https?:\/\/)[^/]+/, `$1${API_HOST}`);
  }
  return url;
}

export function errMsg(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ApiError) {
    if (e.status === 0 || e.code === 'NETWORK')
      return 'No connection. Check your internet and try again.';
    return e.message || fallback;
  }
  if (e instanceof TypeError && /network/i.test(e.message))
    return 'Cannot reach the server. Check your connection.';
  return e instanceof Error && e.message ? e.message : fallback;
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? e.fieldErrors : {};
}

const MIN = 60_000;
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MIN) return 'just now';
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < 24 * 60 * MIN) return `${Math.floor(diff / (60 * MIN))}h ago`;
  if (diff < 7 * 24 * 60 * MIN) return `${Math.floor(diff / (24 * 60 * MIN))}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
