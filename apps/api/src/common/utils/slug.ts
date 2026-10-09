import { slugify } from '@gk/utils';

/** Returns `base`, or `base-2`, `base-3`… until `exists` says the slug is free. */
export async function uniqueSlug(
  input: string,
  exists: (slug: string) => Promise<boolean>,
  fallback = 'item',
): Promise<string> {
  const base = slugify(input) || fallback;
  if (!(await exists(base))) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
