/** Keys whose values must never be altered (secrets, tokens, intentional markdown). */
const SKIP_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'content',
  'code',
]);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAGS = /<\/?[a-zA-Z!][^>]*>/g;

export function sanitizeString(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(HTML_TAGS, '').trim();
}

/** Recursively strips control characters and HTML tags from user supplied strings. */
export function sanitizeDeep<T>(input: T, key?: string): T {
  if (typeof input === 'string') {
    return (key && SKIP_KEYS.has(key) ? input : sanitizeString(input)) as T;
  }
  if (Array.isArray(input)) return input.map((v) => sanitizeDeep(v, key)) as T;
  if (input && typeof input === 'object' && !(input instanceof Date) && !Buffer.isBuffer(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>))
      out[k] = sanitizeDeep(v, k);
    return out as T;
  }
  return input;
}
