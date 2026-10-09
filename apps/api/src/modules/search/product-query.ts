import { Prisma } from '@gk/db';
import type { ProductSort } from '@gk/validators';

export interface ListFilters {
  q?: string;
  categoryPath?: string;
  brandSlugs?: string[];
  sellerIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  discount?: number;
  inStock?: boolean;
  /** attribute slug → accepted values */
  attrs: Record<string, string[]>;
}

export type FacetKey = 'brand' | 'seller' | 'attrs' | 'price' | 'category';

export const BASE_FROM = Prisma.sql`
  FROM "Product" p
  JOIN "Category" c ON c.id = p."categoryId"
  JOIN "SellerProfile" s ON s.id = p."sellerId"
  LEFT JOIN "Brand" b ON b.id = p."brandId"`;

const BASE_WHERE = Prisma.sql`
  p.status = 'ACTIVE' AND p."deletedAt" IS NULL
  AND c."deletedAt" IS NULL AND c."isActive" = true
  AND s.status = 'APPROVED' AND s."deletedAt" IS NULL`;

/** Escape LIKE wildcards in user input. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Normalise free text into lowercase word tokens (letters/digits only). */
export function tokenize(q: string, max = 8): string[] {
  return (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, max);
}

/**
 * Builds a safe `to_tsquery` string: every token is stemmed-matched, the last one as a prefix
 * so results appear while the user is still typing. Tokens contain only letters/digits.
 */
export function toTsQuery(q: string): string | null {
  const tokens = tokenize(q);
  if (tokens.length === 0) return null;
  return tokens.map((t, i) => (i === tokens.length - 1 ? `${t}:*` : t)).join(' & ');
}

export function searchCondition(q: string, mode: 'strict' | 'fuzzy'): Prisma.Sql | null {
  const tsq = toTsQuery(q);
  if (!tsq) return null;
  const clean = tokenize(q).join(' ');
  if (mode === 'strict') {
    return Prisma.sql`(p."searchVector" @@ to_tsquery('english', ${tsq}) OR p.name ILIKE ${'%' + likeEscape(clean) + '%'})`;
  }
  // `<%` is the indexable word-similarity operator; callers run inside a tx that lowers pg_trgm.word_similarity_threshold.
  return Prisma.sql`(${clean} <% p.name OR (b.name IS NOT NULL AND ${clean} <% b.name) OR ${clean} <% c.name)`;
}

export function scoreExpression(q: string | undefined): Prisma.Sql {
  const tsq = q ? toTsQuery(q) : null;
  if (!q || !tsq) return Prisma.sql`0::float8`;
  const clean = tokenize(q).join(' ');
  return Prisma.sql`(
    ts_rank_cd(p."searchVector", to_tsquery('english', ${tsq}), 32) * 2.0
    + word_similarity(${clean}, p.name)
    + (CASE WHEN lower(p.name) LIKE ${likeEscape(clean) + '%'} THEN 0.6 ELSE 0 END)
    + ln(1 + p."soldCount") * 0.03
  )::float8`;
}

/** Combine WHERE fragments, optionally leaving a facet's own filter out (so its counts stay meaningful). */
export function buildWhere(
  f: ListFilters,
  mode: 'strict' | 'fuzzy',
  skip: FacetKey[] = [],
): Prisma.Sql {
  const parts: Prisma.Sql[] = [BASE_WHERE];

  if (f.q) {
    const cond = searchCondition(f.q, mode);
    if (cond) parts.push(cond);
  }
  if (f.categoryPath && !skip.includes('category')) {
    parts.push(
      Prisma.sql`(c.path = ${f.categoryPath} OR c.path LIKE ${likeEscape(f.categoryPath) + '/%'})`,
    );
  }
  if (f.brandSlugs?.length && !skip.includes('brand'))
    parts.push(Prisma.sql`b.slug = ANY(${f.brandSlugs})`);
  if (f.sellerIds?.length && !skip.includes('seller'))
    parts.push(Prisma.sql`p."sellerId" = ANY(${f.sellerIds})`);
  if (!skip.includes('price')) {
    if (f.minPrice !== undefined) parts.push(Prisma.sql`p."minPrice" >= ${f.minPrice}`);
    if (f.maxPrice !== undefined) parts.push(Prisma.sql`p."minPrice" <= ${f.maxPrice}`);
  }
  if (f.rating !== undefined) parts.push(Prisma.sql`p."ratingAvg" >= ${f.rating}`);
  if (f.discount !== undefined && f.discount > 0)
    parts.push(Prisma.sql`p."discountPercent" >= ${Math.floor(f.discount)}`);
  if (f.inStock) parts.push(Prisma.sql`p."totalStock" > 0`);

  if (!skip.includes('attrs')) {
    for (const [key, values] of Object.entries(f.attrs)) {
      if (!values.length || !/^[a-z0-9_-]{1,40}$/.test(key)) continue;
      parts.push(Prisma.sql`(
        p.attributes ->> ${key} = ANY(${values})
        OR EXISTS (
          SELECT 1 FROM "ProductVariant" v
          WHERE v."productId" = p.id AND v."deletedAt" IS NULL AND v."isActive" = true
            AND v.attributes ->> ${key} = ANY(${values})
        )
      )`);
    }
  }
  return Prisma.join(parts, ' AND ');
}

export function orderBy(sort: ProductSort | undefined, hasQuery: boolean): Prisma.Sql {
  switch (sort) {
    case 'price_asc':
      return Prisma.sql`p."minPrice" ASC, p.id ASC`;
    case 'price_desc':
      return Prisma.sql`p."minPrice" DESC, p.id ASC`;
    case 'newest':
      return Prisma.sql`p."createdAt" DESC, p.id ASC`;
    case 'rating':
      return Prisma.sql`p."ratingAvg" DESC, p."ratingCount" DESC, p.id ASC`;
    case 'discount':
      return Prisma.sql`p."discountPercent" DESC, p."soldCount" DESC, p.id ASC`;
    case 'popularity':
      return Prisma.sql`p."soldCount" DESC, p."ratingCount" DESC, p.id ASC`;
    default:
      return hasQuery
        ? Prisma.sql`score DESC, p."soldCount" DESC, p.id ASC`
        : Prisma.sql`p."soldCount" DESC, p."ratingCount" DESC, p.id ASC`;
  }
}

/** Parse `attr_<slug>=A,B` pairs from a query object. */
export function parseAttrFilters(query: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(query)) {
    if (!k.startsWith('attr_') || typeof v !== 'string') continue;
    const key = k.slice(5).toLowerCase();
    const values = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (values.length) out[key] = values;
  }
  return out;
}

/** Cheap trigram-ish similarity (Dice on character bigrams) for "did you mean" suggestions. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = ` ${s.toLowerCase()} `;
    const set = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++)
      set.set(t.slice(i, i + 2), (set.get(t.slice(i, i + 2)) ?? 0) + 1);
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  const total =
    [...A.values()].reduce((x, y) => x + y, 0) + [...B.values()].reduce((x, y) => x + y, 0);
  return total === 0 ? 0 : (2 * inter) / total;
}
