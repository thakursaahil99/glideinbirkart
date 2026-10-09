import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const SITE_NAME = 'Glideinbir Kart';

export function absoluteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const formatDate = (d: string | Date | null | undefined) =>
  d ? dateFmt.format(new Date(d)) : '—';
export const formatDateTime = (d: string | Date | null | undefined) =>
  d ? dateTimeFmt.format(new Date(d)) : '—';

export const compactNumber = (n: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a query string from the current params, overriding/removing keys. */
export function withParams(
  current: URLSearchParams | Record<string, string | undefined>,
  patch: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams(
    current instanceof URLSearchParams
      ? current.toString()
      : (Object.entries(current).filter(([, v]) => v !== undefined) as [string, string][]),
  );
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') params.delete(k);
    else params.set(k, String(v));
  }
  return params;
}

/** Only allow same-origin relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\'))
    return fallback;
  return next;
}

export function truncateText(input: string, max: number) {
  return input.length <= max ? input : `${input.slice(0, max - 1).trimEnd()}…`;
}
