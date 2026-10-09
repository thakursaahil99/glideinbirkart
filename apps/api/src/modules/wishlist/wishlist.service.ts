import { Injectable } from '@nestjs/common';
import type { WishlistItemDto } from '@gk/types';
import { notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { summaryInclude, toSummary } from '../products/products.mapper';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page: number, limit: number): Promise<PagedResult<WishlistItemDto>> {
    const where = { userId, product: { deletedAt: null, status: 'ACTIVE' as const } };
    const [rows, total] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { product: { include: summaryInclude } },
        ...pageArgs(page, limit),
      }),
      this.prisma.wishlistItem.count({ where }),
    ]);
    return paged(
      rows.map((r) => ({
        id: r.id,
        addedAt: r.createdAt.toISOString(),
        product: toSummary(r.product),
      })),
      page,
      limit,
      total,
    );
  }

  async ids(userId: string): Promise<string[]> {
    return (
      await this.prisma.wishlistItem.findMany({ where: { userId }, select: { productId: true } })
    ).map((r) => r.productId);
  }

  async add(userId: string, productId: string): Promise<{ productId: string }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!product) throw notFound('Product');
    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
    return { productId };
  }

  async remove(userId: string, productId: string): Promise<{ productId: string }> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return { productId };
  }
}
