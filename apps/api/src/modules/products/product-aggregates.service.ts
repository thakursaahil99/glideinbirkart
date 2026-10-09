import { Injectable } from '@nestjs/common';
import { discountPercent } from '@gk/utils';
import { Prisma } from '@gk/db';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * Keeps the denormalised columns on Product (min/max price, discount, available stock)
 * consistent with variants and inventory, and invalidates the right caches.
 */
@Injectable()
export class ProductAggregatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** minPrice / maxPrice / minMrp / discountPercent from the active variants. */
  async recomputePricing(productId: string, tx: Tx | PrismaService = this.prisma): Promise<void> {
    const variants = await tx.productVariant.findMany({
      where: { productId, isActive: true, deletedAt: null },
      select: { price: true, mrp: true },
      orderBy: { price: 'asc' },
    });
    if (variants.length === 0) {
      await tx.product.update({
        where: { id: productId },
        data: { minPrice: 0, maxPrice: 0, minMrp: 0, discountPercent: 0 },
      });
      return;
    }
    const cheapest = variants[0] as (typeof variants)[number];
    const maxPrice = variants[variants.length - 1] as (typeof variants)[number];
    await tx.product.update({
      where: { id: productId },
      data: {
        minPrice: cheapest.price,
        maxPrice: maxPrice.price,
        minMrp: cheapest.mrp,
        discountPercent: discountPercent(Number(cheapest.mrp), Number(cheapest.price)),
      },
    });
  }

  /** totalStock = Σ max(quantity − reserved, 0) over active variants. */
  async recomputeStock(productIds: string[], tx: Tx | PrismaService = this.prisma): Promise<void> {
    if (productIds.length === 0) return;
    await tx.$executeRaw`
      UPDATE "Product" p SET "totalStock" = COALESCE((
        SELECT SUM(GREATEST(i.quantity - i.reserved, 0))
        FROM "ProductVariant" v JOIN "Inventory" i ON i."variantId" = v.id
        WHERE v."productId" = p.id AND v."isActive" = true AND v."deletedAt" IS NULL
      ), 0)
      WHERE p.id = ANY(${productIds})`;
  }

  /** Drop cached product pages. Listings keep their short TTL; use `bumpListings` for content changes. */
  async invalidateDetail(productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { slug: true },
    });
    await this.cache.del(...rows.map((r) => `product:${r.slug}`));
  }

  async bumpListings(): Promise<void> {
    await this.cache.bump(CacheNs.products);
  }
}
