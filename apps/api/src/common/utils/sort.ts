/** Whitelisted ORDER BY builder: maps a client sort key to a column and applies asc/desc. */
export function orderByFrom<T extends Record<string, unknown>>(
  sort: string | undefined,
  order: 'asc' | 'desc' | undefined,
  allowed: Record<string, string>,
  fallback: T,
): Record<string, 'asc' | 'desc'> | T {
  const column = sort ? allowed[sort] : undefined;
  if (!column) return fallback;
  return { [column]: order ?? 'desc' };
}
