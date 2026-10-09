import { Injectable } from '@nestjs/common';
import type {
  ProductDetail,
  ProductOption,
  ProductSummary,
  RatingBreakdown,
  VariantDto,
} from '@gk/types';
import { discountPercent } from '@gk/utils';
import { notFound } from '../../common/errors';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { CategoriesService } from '../catalog/categories.service';
import { BASE_FROM } from '../search/product-query';
import { available, num, summaryInclude, toImageDto, toSummary } from './products.mapper';

const MAX_RECENT = 30;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
    private readonly categories: CategoriesService,
  ) {}

  /** Summaries for ids, preserving the requested order and dropping anything not publicly visible. */
  async summaries(ids: string[]): Promise<ProductSummary[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        status: 'ACTIVE',
        deletedAt: null,
        seller: { status: 'APPROVED' },
        category: { isActive: true, deletedAt: null },
      },
      include: summaryInclude,
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map(toSummary);
  }

  // ───────────── product page ─────────────

  async detail(slug: string): Promise<ProductDetail> {
    return this.cache.wrap(`product:${slug}`, 120, async () => {
      const p = await this.prisma.product.findFirst({
        where: { slug, status: 'ACTIVE', deletedAt: null, seller: { status: 'APPROVED' } },
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true, path: true } },
          seller: {
            select: {
              id: true,
              storeName: true,
              slug: true,
              ratingAvg: true,
              ratingCount: true,
              createdAt: true,
            },
          },
          images: { orderBy: { position: 'asc' } },
          variants: {
            where: { isActive: true, deletedAt: null },
            orderBy: [{ position: 'asc' }, { price: 'asc' }],
            include: { inventory: true, images: { select: { id: true } } },
          },
        },
      });
      if (!p) throw notFound('Product');

      const [breakdown, breadcrumbs, options] = await Promise.all([
        this.ratingBreakdown(p.id),
        this.categories.breadcrumbs(p.category.path),
        this.optionsFor(p.variants.map((v) => v.attributes as Record<string, string>)),
      ]);

      const variants: VariantDto[] = p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        attributes: v.attributes as Record<string, string>,
        mrp: num(v.mrp),
        price: num(v.price),
        discountPercent: discountPercent(num(v.mrp), num(v.price)),
        stock: available(v.inventory),
        inStock: available(v.inventory) > 0,
        isDefault: v.isDefault,
        imageIds: v.images.map((i) => i.id),
      }));
      const inStock = variants.filter((v) => v.inStock);
      const pick = inStock.slice().sort((a, b) => a.price - b.price)[0] ?? variants[0];
      const firstImage = p.images.find((i) => !i.variantId) ?? p.images[0];

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
        seller: { id: p.seller.id, storeName: p.seller.storeName, slug: p.seller.slug },
        image: firstImage?.url ?? null,
        price: num(p.minPrice),
        mrp: num(p.minMrp),
        discountPercent: p.discountPercent,
        ratingAvg: num(p.ratingAvg),
        ratingCount: p.ratingCount,
        inStock: inStock.length > 0,
        lowStock: Boolean(pick && pick.inStock && pick.stock <= 5),
        soldCount: p.soldCount,
        defaultVariantId: pick?.id ?? null,
        hasVariants: variants.length > 1,
        createdAt: p.createdAt.toISOString(),
        description: p.description,
        highlights: p.highlights,
        specifications: (p.specifications as Array<{ key: string; value: string }>) ?? [],
        images: p.images.map(toImageDto),
        variants,
        options,
        breadcrumbs,
        gstRate: num(p.gstRate),
        hsnCode: p.hsnCode,
        isReturnable: p.isReturnable,
        returnWindowDays: p.returnWindowDays,
        ratingBreakdown: breakdown,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        sellerInfo: {
          id: p.seller.id,
          storeName: p.seller.storeName,
          slug: p.seller.slug,
          ratingAvg: num(p.seller.ratingAvg),
          ratingCount: p.seller.ratingCount,
          since: p.seller.createdAt.toISOString(),
        },
        status: p.status,
      } satisfies ProductDetail;
    });
  }

  private async ratingBreakdown(productId: string): Promise<RatingBreakdown> {
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId, status: 'VISIBLE', deletedAt: null },
      _count: true,
    });
    const out: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of groups) out[g.rating as 1 | 2 | 3 | 4 | 5] = g._count;
    return out;
  }

  /** Turns variant attribute maps into selectable options with labels and swatches. */
  private async optionsFor(attrMaps: Array<Record<string, string>>): Promise<ProductOption[]> {
    const keys = [...new Set(attrMaps.flatMap((m) => Object.keys(m)))];
    if (keys.length === 0) return [];
    const defs = await this.prisma.attribute.findMany({
      where: { slug: { in: keys } },
      include: { values: true },
    });
    return keys.map((key) => {
      const def = defs.find((d) => d.slug === key);
      const used = [...new Set(attrMaps.map((m) => m[key]).filter((v): v is string => Boolean(v)))];
      const order = def
        ? new Map(def.values.map((v, i) => [v.value, v.sortOrder * 1000 + i]))
        : new Map<string, number>();
      used.sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6));
      return {
        key,
        label: def?.name ?? key,
        type: def?.type ?? 'TEXT',
        values: used.map((value) => ({
          value,
          hex: def?.values.find((x) => x.value === value)?.hex ?? null,
        })),
      };
    });
  }

  // ───────────── related products ─────────────

  async similar(productId: string, limit = 12): Promise<ProductSummary[]> {
    return this.cache.wrapNs(CacheNs.products, `similar:${productId}:${limit}`, 300, async () => {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p2.id FROM "Product" p2
        JOIN "Category" c ON c.id = p2."categoryId"
        JOIN "SellerProfile" s ON s.id = p2."sellerId"
        JOIN "Product" src ON src.id = ${productId}
        WHERE p2.id <> src.id AND p2.status = 'ACTIVE' AND p2."deletedAt" IS NULL
          AND c."isActive" = true AND s.status = 'APPROVED' AND p2."totalStock" > 0
          AND (p2."categoryId" = src."categoryId" OR c."parentId" = (SELECT "parentId" FROM "Category" WHERE id = src."categoryId"))
        ORDER BY (CASE WHEN p2."categoryId" = src."categoryId" THEN 0 ELSE 1 END),
                 abs(p2."minPrice" - src."minPrice") / GREATEST(src."minPrice", 1) - p2."ratingAvg" * 0.05
        LIMIT ${limit}`;
      return this.summaries(rows.map((r) => r.id));
    });
  }

  async frequentlyBoughtTogether(productId: string, limit = 3): Promise<ProductSummary[]> {
    return this.cache.wrapNs(CacheNs.products, `fbt:${productId}:${limit}`, 600, async () => {
      const co = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT oi2."productId" AS id, COUNT(*)::int AS c
        FROM "OrderItem" oi1
        JOIN "OrderItem" oi2 ON oi2."orderId" = oi1."orderId" AND oi2."productId" <> oi1."productId"
        JOIN "Product" p ON p.id = oi2."productId" AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND p."totalStock" > 0
        WHERE oi1."productId" = ${productId}
        GROUP BY oi2."productId" ORDER BY c DESC LIMIT ${limit}`;
      const ids = co.map((r) => r.id);
      if (ids.length < limit) {
        const fill = await this.similar(productId, limit + 2);
        for (const f of fill) if (ids.length < limit && !ids.includes(f.id)) ids.push(f.id);
      }
      return this.summaries(ids);
    });
  }

  // ───────────── behaviour tracking & personalisation ─────────────

  /** Counts a product page view and (for signed-in users) records it in their recently-viewed list. */
  async trackView(productId: string, userId?: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, sellerId: true },
    });
    if (!product) throw notFound('Product');
    await this.prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 1 } },
    });
    const day = new Date().toISOString().slice(0, 10);
    const key = `gk:views:${product.sellerId}:${day}`;
    await this.redis.client
      .multi()
      .incr(key)
      .expire(key, 400 * 86400)
      .exec()
      .catch(() => undefined);

    if (userId) {
      await this.prisma.recentlyViewed.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId },
        update: { viewedAt: new Date() },
      });
      const stale = await this.prisma.recentlyViewed.findMany({
        where: { userId },
        orderBy: { viewedAt: 'desc' },
        skip: MAX_RECENT,
        select: { id: true },
      });
      if (stale.length)
        await this.prisma.recentlyViewed.deleteMany({
          where: { id: { in: stale.map((s) => s.id) } },
        });
    }
  }

  async recentlyViewed(userId: string, limit = 12): Promise<ProductSummary[]> {
    const rows = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: limit + 6,
      select: { productId: true },
    });
    return (await this.summaries(rows.map((r) => r.productId))).slice(0, limit);
  }

  /**
   * "Recommended for you": categories from recent views, wishlist and past orders (weighted),
   * excluding things already seen; falls back to trending for brand-new visitors.
   */
  async recommended(
    userId: string | undefined,
    viewedIds: string[] | undefined,
    limit = 12,
  ): Promise<ProductSummary[]> {
    const weights = new Map<string, number>();
    const seen = new Set<string>(viewedIds ?? []);
    const bump = (categoryId: string, w: number) =>
      weights.set(categoryId, (weights.get(categoryId) ?? 0) + w);

    if (userId) {
      const [views, wishes, orders] = await Promise.all([
        this.prisma.recentlyViewed.findMany({
          where: { userId },
          orderBy: { viewedAt: 'desc' },
          take: 20,
          select: { productId: true, product: { select: { categoryId: true } } },
        }),
        this.prisma.wishlistItem.findMany({
          where: { userId },
          take: 20,
          select: { productId: true, product: { select: { categoryId: true } } },
        }),
        this.prisma.orderItem.findMany({
          where: { order: { userId } },
          take: 30,
          orderBy: { order: { createdAt: 'desc' } },
          select: { productId: true, product: { select: { categoryId: true } } },
        }),
      ]);
      views.forEach((v) => (seen.add(v.productId), bump(v.product.categoryId, 2)));
      wishes.forEach((w) => (seen.add(w.productId), bump(w.product.categoryId, 3)));
      orders.forEach((o) => (seen.add(o.productId), bump(o.product.categoryId, 4)));
    }
    if (viewedIds?.length) {
      const viewed = await this.prisma.product.findMany({
        where: { id: { in: viewedIds.slice(0, 30) } },
        select: { categoryId: true },
      });
      viewed.forEach((v) => bump(v.categoryId, 2));
    }

    const top = [...weights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id);
    let ids: string[] = [];
    if (top.length > 0) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p.id ${BASE_FROM}
        WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND c."isActive" = true AND s.status = 'APPROVED'
          AND p."totalStock" > 0 AND p."categoryId" = ANY(${top}) AND NOT (p.id = ANY(${[...seen]}))
        ORDER BY (p."ratingAvg" * 2 + ln(1 + p."soldCount")) DESC, p.id
        LIMIT ${limit}`;
      ids = rows.map((r) => r.id);
    }
    if (ids.length < limit) {
      const fill = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p.id ${BASE_FROM}
        WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND c."isActive" = true AND s.status = 'APPROVED'
          AND p."totalStock" > 0 AND NOT (p.id = ANY(${[...seen, ...ids]}))
        ORDER BY (p."viewCount" + p."soldCount" * 5) DESC, p.id LIMIT ${limit - ids.length}`;
      ids = [...ids, ...fill.map((r) => r.id)];
    }
    return this.summaries(ids);
  }

  /** Minimal lookup used by other modules. */
  async idBySlug(slug: string): Promise<string> {
    const p = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    if (!p) throw notFound('Product');
    return p.id;
  }
}
