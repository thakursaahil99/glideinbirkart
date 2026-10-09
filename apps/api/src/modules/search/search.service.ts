import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { ProductFacets, ProductListMeta, ProductSummary, SearchSuggestions } from '@gk/types';
import type { ProductListQuery } from '@gk/validators';
import { notFound } from '../../common/errors';
import { PagedResult, paged } from '../../common/types';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { CategoriesService } from '../catalog/categories.service';
import { summaryInclude, toSummary } from '../products/products.mapper';
import {
  BASE_FROM,
  buildWhere,
  likeEscape,
  orderBy,
  parseAttrFilters,
  scoreExpression,
  similarity,
  tokenize,
  type ListFilters,
} from './product-query';

type Db = Pick<PrismaService, '$queryRaw'>;

const POPULAR_KEY = 'gk:search:popular';
const DEFAULT_POPULAR = [
  'iphone',
  'running shoes',
  'headphones',
  'saree',
  'smart watch',
  'laptop',
  'kurta',
  'backpack',
];

interface ListResult {
  items: ProductSummary[];
  page: number;
  limit: number;
  total: number;
  meta: ProductListMeta;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: CacheService,
    private readonly categories: CategoriesService,
  ) {}

  /** Runs `fn` directly, or inside a transaction with a lowered trigram threshold for typo-tolerant queries. */
  private async run<T>(fuzzy: boolean, fn: (db: Db) => Promise<T>): Promise<T> {
    if (!fuzzy) return fn(this.prisma);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.42`;
      return fn(tx);
    });
  }

  private async idsAndTotal(
    db: Db,
    f: ListFilters,
    mode: 'strict' | 'fuzzy',
    sort: ProductListQuery['sort'],
    page: number,
    limit: number,
  ) {
    const where = buildWhere(f, mode);
    const score = scoreExpression(f.q);
    const [rows, count] = await Promise.all([
      db.$queryRaw<Array<{ id: string }>>`
        SELECT p.id, ${score} AS score ${BASE_FROM}
        WHERE ${where}
        ORDER BY ${orderBy(sort, Boolean(f.q))}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      db.$queryRaw<
        Array<{ total: number }>
      >`SELECT COUNT(*)::int AS total ${BASE_FROM} WHERE ${where}`,
    ]);
    return { ids: rows.map((r) => r.id), total: count[0]?.total ?? 0 };
  }

  private async facets(db: Db, f: ListFilters, mode: 'strict' | 'fuzzy'): Promise<ProductFacets> {
    const [brands, sellers, price, cats, attrRows] = await Promise.all([
      db.$queryRaw<Array<{ id: string; name: string; slug: string; count: number }>>`
        SELECT b.id, b.name, b.slug, COUNT(*)::int AS count ${BASE_FROM}
        WHERE ${buildWhere(f, mode, ['brand'])} AND b.id IS NOT NULL
        GROUP BY b.id ORDER BY count DESC, b.name LIMIT 30`,
      db.$queryRaw<Array<{ id: string; storeName: string; count: number }>>`
        SELECT s.id, s."storeName", COUNT(*)::int AS count ${BASE_FROM}
        WHERE ${buildWhere(f, mode, ['seller'])}
        GROUP BY s.id ORDER BY count DESC, s."storeName" LIMIT 20`,
      db.$queryRaw<Array<{ min: number | null; max: number | null }>>`
        SELECT MIN(p."minPrice")::float8 AS min, MAX(p."minPrice")::float8 AS max ${BASE_FROM}
        WHERE ${buildWhere(f, mode, ['price'])}`,
      db.$queryRaw<Array<{ path: string; count: number }>>`
        SELECT c.path, COUNT(*)::int AS count ${BASE_FROM}
        WHERE ${buildWhere(f, mode)} GROUP BY c.path`,
      this.attributeFacetRows(db, f, mode),
    ]);

    // roll category counts up to the level just below the current category
    const depth = f.categoryPath ? f.categoryPath.split('/').length : 0;
    const byChild = new Map<string, number>();
    for (const row of cats) {
      const segs = row.path.split('/');
      const child = segs[depth];
      if (child) byChild.set(child, (byChild.get(child) ?? 0) + row.count);
    }
    const childRows = byChild.size
      ? await this.prisma.category.findMany({
          where: { slug: { in: [...byChild.keys()] }, deletedAt: null },
          select: { id: true, name: true, slug: true },
        })
      : [];

    return {
      brands,
      sellers: sellers.map((s) => ({ id: s.id, storeName: s.storeName, count: s.count })),
      categories: childRows
        .map((c) => ({ ...c, count: byChild.get(c.slug) ?? 0 }))
        .sort((a, b) => b.count - a.count),
      priceRange: { min: Math.floor(price[0]?.min ?? 0), max: Math.ceil(price[0]?.max ?? 0) },
      attributes: await this.decorateAttributeFacets(attrRows),
    };
  }

  private async attributeFacetRows(db: Db, f: ListFilters, mode: 'strict' | 'fuzzy') {
    let keys: string[];
    if (f.categoryPath) {
      const cat = await this.prisma.category.findFirst({
        where: { path: f.categoryPath, deletedAt: null },
        select: { id: true },
      });
      if (cat) {
        // attributes configured on this category, its ancestors, and every descendant (parent pages facet on child attributes)
        const [own, subtree] = await Promise.all([
          this.categories.attributesFor(cat.id),
          this.categories.subtreeIds(cat.id),
        ]);
        const below = await this.prisma.categoryAttribute.findMany({
          where: { categoryId: { in: subtree }, attribute: { isFilterable: true } },
          select: { attribute: { select: { slug: true } } },
        });
        keys = [
          ...new Set([
            ...own.filter((a) => a.isFilterable).map((a) => a.slug),
            ...below.map((b) => b.attribute.slug),
          ]),
        ];
      } else keys = [];
    } else {
      keys = (
        await this.prisma.attribute.findMany({
          where: { isFilterable: true },
          select: { slug: true },
        })
      ).map((a) => a.slug);
    }
    if (keys.length === 0) return [] as Array<{ key: string; value: string; count: number }>;
    const where = buildWhere(f, mode, ['attrs']);
    return db.$queryRaw<Array<{ key: string; value: string; count: number }>>`
      SELECT t.key, t.value, COUNT(DISTINCT t.pid)::int AS count FROM (
        SELECT p.id AS pid, kv.key, kv.value ${BASE_FROM}
          JOIN "ProductVariant" v ON v."productId" = p.id AND v."deletedAt" IS NULL AND v."isActive" = true
          CROSS JOIN LATERAL jsonb_each_text(v.attributes) AS kv(key, value)
          WHERE ${where}
        UNION ALL
        SELECT p.id AS pid, kv.key, kv.value ${BASE_FROM}
          CROSS JOIN LATERAL jsonb_each_text(p.attributes) AS kv(key, value)
          WHERE ${where}
      ) t
      WHERE t.key = ANY(${keys})
      GROUP BY t.key, t.value
      ORDER BY t.key, count DESC`;
  }

  private async decorateAttributeFacets(
    rows: Array<{ key: string; value: string; count: number }>,
  ): Promise<ProductFacets['attributes']> {
    if (rows.length === 0) return [];
    const defs = await this.prisma.attribute.findMany({
      where: { slug: { in: [...new Set(rows.map((r) => r.key))] } },
      include: { values: true },
    });
    const out: ProductFacets['attributes'] = [];
    for (const def of defs) {
      const values = rows
        .filter((r) => r.key === def.slug)
        .map((r) => ({
          value: r.value,
          hex: def.values.find((v) => v.value === r.value)?.hex ?? null,
          count: r.count,
        }));
      if (values.length > 0) out.push({ key: def.slug, label: def.name, type: def.type, values });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  private didYouMean(q: string, topName: string | undefined): string | null {
    if (!topName) return null;
    const words = tokenize(topName, 20);
    const original = tokenize(q);
    const corrected = original.map((t) => {
      if (words.includes(t)) return t;
      let best = t;
      let bestScore = 0.5;
      for (const w of words) {
        const sc = similarity(t, w);
        if (sc > bestScore) {
          best = w;
          bestScore = sc;
        }
      }
      return best;
    });
    const suggestion = corrected.join(' ');
    return suggestion !== original.join(' ') ? suggestion : null;
  }

  async list(query: ProductListQuery): Promise<PagedResult<ProductSummary>> {
    const { page, limit, sort } = query;
    const filters: ListFilters = {
      q: query.q || undefined,
      brandSlugs: query.brand,
      sellerIds: query.seller,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      rating: query.rating,
      discount: query.discount,
      inStock: query.inStock,
      attrs: parseAttrFilters(query),
    };

    let category: ListResult['meta']['category'];
    if (query.category) {
      category = await this.categories.bySlug(query.category).catch(() => {
        throw notFound('Category');
      });
      filters.categoryPath = category.path;
    }

    const cacheKey = `list:${this.cache.hash({ filters, sort, page, limit })}`;
    const result = await this.cache.wrapNs(
      CacheNs.products,
      cacheKey,
      120,
      async (): Promise<ListResult> => {
        let mode: 'strict' | 'fuzzy' = 'strict';
        let found = await this.run(false, (db) =>
          this.idsAndTotal(db, filters, 'strict', sort, page, limit),
        );
        if (filters.q && found.total === 0) {
          mode = 'fuzzy';
          found = await this.run(true, (db) =>
            this.idsAndTotal(db, filters, 'fuzzy', sort, page, limit),
          );
        }

        const rows = found.ids.length
          ? await this.prisma.product.findMany({
              where: { id: { in: found.ids } },
              include: summaryInclude,
            })
          : [];
        const order = new Map(found.ids.map((id, i) => [id, i]));
        const items = rows
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          .map(toSummary);

        const meta: ProductListMeta = { query: filters.q };
        if (page === 1)
          meta.facets = await this.run(mode === 'fuzzy', (db) => this.facets(db, filters, mode));
        if (mode === 'fuzzy' && filters.q)
          meta.didYouMean = this.didYouMean(filters.q, items[0]?.name);
        return { items, page, limit, total: found.total, meta };
      },
    );

    if (filters.q && page === 1 && result.total > 0) void this.recordQuery(filters.q);
    return paged(result.items, result.page, result.limit, result.total, {
      ...result.meta,
      ...(category ? { category } : {}),
    });
  }

  // ───────────── autocomplete & popular searches ─────────────

  async suggest(raw: string): Promise<SearchSuggestions> {
    const q = tokenize(raw).join(' ');
    if (q.length < 2) return { products: [], categories: [], brands: [], queries: [] };
    return this.cache.wrapNs(CacheNs.products, `suggest:${q}`, 120, async () => {
      const like = `%${likeEscape(q)}%`;
      const prefix = `${likeEscape(q)}%`;
      const [products, categories, brands, popular] = await Promise.all([
        this.run(
          true,
          (db) =>
            db.$queryRaw<
              Array<{
                id: string;
                slug: string;
                name: string;
                price: number;
                category: string;
                image: string | null;
              }>
            >`
            SELECT p.id, p.slug, p.name, p."minPrice"::float8 AS price, c.name AS category,
              (SELECT url FROM "ProductImage" i WHERE i."productId" = p.id AND i."variantId" IS NULL ORDER BY i.position LIMIT 1) AS image
            ${BASE_FROM}
            WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND c."isActive" = true AND s.status = 'APPROVED'
              AND (p.name ILIKE ${like} OR ${q} <% p.name)
            ORDER BY (CASE WHEN lower(p.name) LIKE ${prefix} THEN 0 ELSE 1 END), word_similarity(${q}, p.name) DESC, p."soldCount" DESC
            LIMIT 6`,
        ),
        this.run(
          true,
          (db) =>
            db.$queryRaw<Array<{ id: string; slug: string; name: string }>>`
            SELECT id, slug, name FROM "Category"
            WHERE "deletedAt" IS NULL AND "isActive" = true AND (name ILIKE ${like} OR ${q} <% name)
            ORDER BY word_similarity(${q}, name) DESC, depth ASC LIMIT 4`,
        ),
        this.run(
          true,
          (db) =>
            db.$queryRaw<Array<{ id: string; slug: string; name: string }>>`
            SELECT id, slug, name FROM "Brand"
            WHERE "deletedAt" IS NULL AND "isActive" = true AND (name ILIKE ${like} OR ${q} <% name)
            ORDER BY word_similarity(${q}, name) DESC LIMIT 4`,
        ),
        this.redis.client.zrevrange(POPULAR_KEY, 0, 199).catch(() => [] as string[]),
      ]);
      const queries = popular.filter((p) => p.startsWith(q) && p !== q).slice(0, 4);
      return { products, categories, brands, queries };
    });
  }

  async popular(limit = 8): Promise<string[]> {
    const top = await this.redis.client
      .zrevrange(POPULAR_KEY, 0, limit - 1)
      .catch(() => [] as string[]);
    return top.length >= limit ? top : [...new Set([...top, ...DEFAULT_POPULAR])].slice(0, limit);
  }

  private async recordQuery(raw: string): Promise<void> {
    const q = tokenize(raw).join(' ');
    if (q.length < 3 || q.length > 40) return;
    try {
      await this.redis.client.zincrby(POPULAR_KEY, 1, q);
      if (Math.random() < 0.02) await this.redis.client.zremrangebyrank(POPULAR_KEY, 0, -501);
    } catch {
      /* analytics only */
    }
  }

  /** Re-index products after a brand / category rename (invoked by the search-index worker). */
  async refreshIndex(job: {
    scope: 'product' | 'brand' | 'category' | 'all';
    id?: string;
  }): Promise<number> {
    let where: Prisma.Sql;
    if (job.scope === 'product') where = Prisma.sql`id = ${job.id}`;
    else if (job.scope === 'brand') where = Prisma.sql`"brandId" = ${job.id}`;
    else if (job.scope === 'category') {
      const ids = job.id ? await this.categories.subtreeIds(job.id) : [];
      where = Prisma.sql`"categoryId" = ANY(${ids})`;
    } else where = Prisma.sql`true`;
    // Touching `name` fires product_search_vector_trigger, which rebuilds the weighted tsvector (incl. brand + category names).
    const n = await this.prisma.$executeRaw`UPDATE "Product" SET name = name WHERE ${where}`;
    await this.cache.bump(CacheNs.products);
    return Number(n);
  }
}
