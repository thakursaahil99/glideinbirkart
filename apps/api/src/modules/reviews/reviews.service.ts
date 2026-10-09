import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { RatingBreakdown, ReviewDto, SellerReviewRow } from '@gk/types';
import type { ReviewInput, ReviewListQuery } from '@gk/validators';
import { conflict, forbidden, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductAggregatesService } from '../products/product-aggregates.service';

const include = {
  user: { select: { id: true, name: true, avatarUrl: true } },
  images: { select: { url: true } },
} satisfies Prisma.ReviewInclude;

type Row = Prisma.ReviewGetPayload<{ include: typeof include }>;

const toDto = (r: Row): ReviewDto => ({
  id: r.id,
  productId: r.productId,
  rating: r.rating,
  title: r.title,
  body: r.body,
  images: r.images.map((i) => i.url),
  isVerifiedPurchase: r.isVerifiedPurchase,
  helpfulCount: r.helpfulCount,
  user: { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl },
  sellerReply: r.sellerReply,
  sellerRepliedAt: r.sellerRepliedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly aggregates: ProductAggregatesService,
  ) {}

  async listForProduct(productId: string, q: ReviewListQuery): Promise<PagedResult<ReviewDto>> {
    const where: Prisma.ReviewWhereInput = {
      productId,
      status: 'VISIBLE',
      deletedAt: null,
      ...(q.rating ? { rating: q.rating } : {}),
      ...(q.withImages ? { images: { some: {} } } : {}),
    };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      q.sort === 'helpful'
        ? [{ helpfulCount: 'desc' }, { createdAt: 'desc' }]
        : q.sort === 'high'
          ? [{ rating: 'desc' }, { createdAt: 'desc' }]
          : q.sort === 'low'
            ? [{ rating: 'asc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];
    const [rows, total, groups] = await Promise.all([
      this.prisma.review.findMany({ where, include, orderBy, ...pageArgs(q.page, q.limit) }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId, status: 'VISIBLE', deletedAt: null },
        _count: true,
      }),
    ]);
    const breakdown: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    groups.forEach((g) => (breakdown[g.rating as 1 | 2 | 3 | 4 | 5] = g._count));
    return paged(rows.map(toDto), q.page, q.limit, total, { breakdown });
  }

  /** Whether this user may review the product, and which delivered order line (if any) it would attach to. */
  async eligibility(userId: string, productId: string) {
    const [existing, delivered] = await Promise.all([
      this.prisma.review.findFirst({
        where: { productId, userId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.orderItem.findFirst({
        where: { productId, order: { userId }, subOrder: { status: 'DELIVERED' }, review: null },
        select: { id: true },
      }),
    ]);
    return {
      canReview: !existing,
      hasReviewed: Boolean(existing),
      verifiedPurchase: Boolean(delivered),
      orderItemId: delivered?.id ?? null,
    };
  }

  async create(userId: string, input: ReviewInput & { images: string[] }): Promise<ReviewDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, sellerId: true, seller: { select: { userId: true } } },
    });
    if (!product) throw notFound('Product');

    const existing = await this.prisma.review.findFirst({
      where: { productId: input.productId, userId },
    });
    if (existing && !existing.deletedAt)
      throw conflict(
        'ALREADY_REVIEWED',
        'You have already reviewed this product. Edit your review instead.',
      );

    let orderItemId: string | null = null;
    if (input.orderItemId) {
      const item = await this.prisma.orderItem.findFirst({
        where: {
          id: input.orderItemId,
          productId: input.productId,
          order: { userId },
          subOrder: { status: 'DELIVERED' },
          review: null,
        },
        select: { id: true },
      });
      if (!item) throw forbidden('You can only review items from your delivered orders');
      orderItemId = item.id;
    } else {
      orderItemId = (await this.eligibility(userId, input.productId)).orderItemId;
    }

    const review = await this.prisma.review.create({
      data: {
        productId: input.productId,
        userId,
        orderItemId,
        rating: input.rating,
        title: input.title || null,
        body: input.body || null,
        isVerifiedPurchase: Boolean(orderItemId),
        images: { create: input.images.map((url) => ({ url })) },
      },
      include,
    });
    await this.refreshRatings(input.productId, product.sellerId);
    await this.notifications.notify(product.seller.userId, {
      type: 'REVIEW',
      title: `New ${input.rating}★ review`,
      body: `${product.name}${input.title ? `: "${input.title}"` : ''}`,
      data: { reviewId: review.id, link: '/seller/reviews' },
    });
    return toDto(review);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<ReviewInput> & { images?: string[] },
  ): Promise<ReviewDto> {
    const r = await this.prisma.review.findFirst({
      where: { id, userId, deletedAt: null },
      include: { product: { select: { sellerId: true } } },
    });
    if (!r) throw notFound('Review');
    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        ...(input.body !== undefined ? { body: input.body || null } : {}),
        ...(input.images
          ? { images: { deleteMany: {}, create: input.images.map((url) => ({ url })) } }
          : {}),
      },
      include,
    });
    await this.refreshRatings(r.productId, r.product.sellerId);
    return toDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const r = await this.prisma.review.findFirst({
      where: { id, userId, deletedAt: null },
      include: { product: { select: { sellerId: true } } },
    });
    if (!r) throw notFound('Review');
    // free the order-line link so a fresh review can be written later
    await this.prisma.review.update({
      where: { id },
      data: { deletedAt: new Date(), orderItemId: null },
    });
    await this.refreshRatings(r.productId, r.product.sellerId);
  }

  async markHelpful(userId: string, id: string): Promise<{ helpfulCount: number }> {
    const review = await this.prisma.review.findFirst({
      where: { id, deletedAt: null, status: 'VISIBLE' },
      select: { id: true, userId: true },
    });
    if (!review) throw notFound('Review');
    if (review.userId === userId) throw forbidden('You cannot vote on your own review');
    const added = await this.redis.client.sadd(`gk:review:helpful:${id}`, userId);
    if (added === 1) {
      const r = await this.prisma.review.update({
        where: { id },
        data: { helpfulCount: { increment: 1 } },
        select: { helpfulCount: true },
      });
      return r;
    }
    return this.prisma.review.findUniqueOrThrow({ where: { id }, select: { helpfulCount: true } });
  }

  /** Recompute denormalised product + seller rating after any review change. */
  async refreshRatings(productId: string, sellerId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { productId, status: 'VISIBLE', deletedAt: null },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count },
    });
    const seller = await this.prisma.review.aggregate({
      where: { product: { sellerId }, status: 'VISIBLE', deletedAt: null },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.sellerProfile.update({
      where: { id: sellerId },
      data: {
        ratingAvg: Math.round((seller._avg.rating ?? 0) * 100) / 100,
        ratingCount: seller._count,
      },
    });
    await this.aggregates.invalidateDetail([productId]);
    await this.aggregates.bumpListings();
  }

  // ───────────── seller ─────────────

  async listForSeller(
    sellerId: string,
    page: number,
    limit: number,
    unreplied: boolean,
  ): Promise<PagedResult<SellerReviewRow>> {
    const where: Prisma.ReviewWhereInput = {
      product: { sellerId },
      deletedAt: null,
      status: 'VISIBLE',
      ...(unreplied ? { sellerReply: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: { ...include, product: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.review.count({ where }),
    ]);
    return paged(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.product.name,
        rating: r.rating,
        title: r.title,
        body: r.body,
        customerName: r.user.name,
        sellerReply: r.sellerReply,
        createdAt: r.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    );
  }

  async reply(sellerId: string, id: string, body: string): Promise<ReviewDto> {
    const r = await this.prisma.review.findFirst({
      where: { id, product: { sellerId }, deletedAt: null },
      include: { product: { select: { name: true } } },
    });
    if (!r) throw notFound('Review');
    const updated = await this.prisma.review.update({
      where: { id },
      data: { sellerReply: body, sellerRepliedAt: new Date() },
      include,
    });
    await this.notifications.notify(r.userId, {
      type: 'REVIEW',
      title: 'The seller replied to your review',
      body: `${r.product.name}: "${body.slice(0, 100)}"`,
      data: { productId: r.productId },
    });
    await this.aggregates.invalidateDetail([r.productId]);
    return toDto(updated);
  }

  // ───────────── admin ─────────────

  async setVisibility(id: string, hidden: boolean): Promise<void> {
    const r = await this.prisma.review.findFirst({
      where: { id, deletedAt: null },
      include: { product: { select: { sellerId: true } } },
    });
    if (!r) throw notFound('Review');
    await this.prisma.review.update({
      where: { id },
      data: { status: hidden ? 'HIDDEN' : 'VISIBLE' },
    });
    await this.refreshRatings(r.productId, r.product.sellerId);
  }
}
