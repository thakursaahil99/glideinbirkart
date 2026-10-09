import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { BannerDto, HomeData } from '@gk/types';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';
import { CategoriesService } from '../catalog/categories.service';
import { BASE_FROM } from '../search/product-query';
import { ProductsService } from './products.service';

const VISIBLE = Prisma.sql`p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND c."isActive" = true AND c."deletedAt" IS NULL AND s.status = 'APPROVED' AND p."totalStock" > 0`;

const toBanner = (b: {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  linkUrl: string | null;
  ctaText: string | null;
  bgColor: string | null;
  placement: BannerDto['placement'];
  sortOrder: number;
}): BannerDto => ({
  id: b.id,
  title: b.title,
  subtitle: b.subtitle,
  imageUrl: b.imageUrl,
  mobileImageUrl: b.mobileImageUrl,
  linkUrl: b.linkUrl,
  ctaText: b.ctaText,
  bgColor: b.bgColor,
  placement: b.placement,
  sortOrder: b.sortOrder,
});

/** End of the current day in IST — the "deals of the day" countdown target. */
export function endOfDayIst(now = new Date()): Date {
  const istMs = now.getTime() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  const endIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 0, 0, 0);
  return new Date(endIst - 5.5 * 3600 * 1000);
}

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
  ) {}

  private async feed(
    order: Prisma.Sql,
    limit: number,
    extra: Prisma.Sql = Prisma.sql`true`,
    categoryPath?: string,
  ) {
    const catFilter = categoryPath
      ? Prisma.sql`(c.path = ${categoryPath} OR c.path LIKE ${categoryPath + '/%'})`
      : Prisma.sql`true`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id ${BASE_FROM} WHERE ${VISIBLE} AND ${extra} AND ${catFilter}
      ORDER BY ${order} LIMIT ${limit}`;
    return this.products.summaries(rows.map((r) => r.id));
  }

  async get(): Promise<HomeData> {
    // The deals countdown is derived from the clock, so the cache TTL is kept short.
    return this.cache.wrapNs(CacheNs.products, 'home', 180, async () => {
      const now = new Date();
      const [banners, tree] = await Promise.all([
        this.prisma.banner.findMany({
          where: {
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
          orderBy: { sortOrder: 'asc' },
        }),
        this.categories.tree(),
      ]);

      const [deals, trending, bestSellers, newArrivals, topRated] = await Promise.all([
        // deterministic daily shuffle among strong discounts → fresh deals each day
        this.feed(
          Prisma.sql`md5(p.id || current_date::text)`,
          12,
          Prisma.sql`p."discountPercent" >= 20`,
        ),
        this.feed(Prisma.sql`(p."viewCount" + p."soldCount" * 5) DESC, p.id`, 12),
        this.feed(Prisma.sql`p."soldCount" DESC, p.id`, 12),
        this.feed(Prisma.sql`p."createdAt" DESC, p.id`, 12),
        this.feed(
          Prisma.sql`p."ratingAvg" DESC, p."ratingCount" DESC, p.id`,
          12,
          Prisma.sql`p."ratingCount" >= 3`,
        ),
      ]);

      const featuredRoots = tree.filter((c) => (c.productCount ?? 0) >= 4).slice(0, 4);
      const featured = await Promise.all(
        featuredRoots.map(async (category) => ({
          category: { ...category, children: undefined },
          products: await this.feed(
            Prisma.sql`p."soldCount" DESC, p.id`,
            8,
            Prisma.sql`true`,
            category.path,
          ),
        })),
      );

      return {
        banners: banners.filter((b) => b.placement === 'HERO').map(toBanner),
        secondaryBanners: banners.filter((b) => b.placement === 'SECONDARY').map(toBanner),
        categories: tree.map((c) => ({
          ...c,
          children: c.children?.map((x) => ({ ...x, children: undefined })),
        })),
        deals: { endsAt: endOfDayIst(now).toISOString(), products: deals },
        trending,
        bestSellers,
        newArrivals,
        topRated,
        featured,
      } satisfies HomeData;
    });
  }
}
