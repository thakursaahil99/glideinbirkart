'use client';

/** Small localStorage-backed lists (recent searches, recently viewed product ids for guests). Always safe to call. */

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable / full */
  }
}

function push(key: string, value: string, max: number) {
  if (typeof window === 'undefined') return;
  write(key, [value, ...read(key).filter((v) => v !== value)].slice(0, max));
}

export const recentSearches = {
  get: () => (typeof window === 'undefined' ? [] : read('gk_recent_searches')),
  add: (q: string) => q.trim().length >= 2 && push('gk_recent_searches', q.trim().toLowerCase(), 8),
  clear: () => typeof window !== 'undefined' && write('gk_recent_searches', []),
};

export const viewedProducts = {
  get: () => (typeof window === 'undefined' ? [] : read('gk_viewed')),
  add: (id: string) => push('gk_viewed', id, 20),
};
