import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { AdminCouponDto, CouponDto } from '@gk/types';
import type { AdminListQuery, CouponOutput } from '@gk/validators';
import { computeCouponDiscount, formatINR } from '@gk/utils';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { num } from '../products/products.mapper';

type CouponRow = Prisma.CouponGetPayload<object>;

const toAdminDto = (c: CouponRow): AdminCouponDto => ({
  id: c.id,
  code: c.code,
  description: c.description,
  type: c.type,
  value: num(c.value),
  minOrderAmount: num(c.minOrderAmount),
  maxDiscount: c.maxDiscount == null ? null : num(c.maxDiscount),
  usageLimit: c.usageLimit,
  usedCount: c.usedCount,
  perUserLimit: c.perUserLimit,
  startsAt: c.startsAt?.toISOString() ?? null,
  expiresAt: c.expiresAt?.toISOString() ?? null,
  isActive: c.isActive,
});

export interface ValidatedCoupon {
  coupon: CouponRow;
  discount: number;
}

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws a descriptive error when the coupon cannot be applied to this user and subtotal. */
  async validate(
    code: string,
    userId: string,
    subtotal: number,
    db: Db = this.prisma,
  ): Promise<ValidatedCoupon> {
    const coupon = await db.coupon.findFirst({
      where: { code: code.toUpperCase(), deletedAt: null },
    });
    const now = new Date();
    if (!coupon || !coupon.isActive)
      throw badRequest('INVALID_COUPON', 'This coupon code is not valid');
    if (coupon.startsAt && coupon.startsAt > now)
      throw badRequest('COUPON_NOT_STARTED', 'This coupon is not active yet');
    if (coupon.expiresAt && coupon.expiresAt < now)
      throw badRequest('COUPON_EXPIRED', 'This coupon has expired');
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
      throw badRequest('COUPON_EXHAUSTED', 'This coupon has reached its usage limit');

    const usedByUser = await db.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (usedByUser >= coupon.perUserLimit)
      throw badRequest('COUPON_USER_LIMIT', 'You have already used this coupon');

    const min = num(coupon.minOrderAmount);
    if (subtotal < min)
      throw badRequest(
        'COUPON_MIN_ORDER',
        `Add ${formatINR(min - subtotal)} more to use this coupon`,
      );

    const discount = computeCouponDiscount(
      {
        type: coupon.type,
        value: num(coupon.value),
        minOrderAmount: min,
        maxDiscount: coupon.maxDiscount == null ? null : num(coupon.maxDiscount),
      },
      subtotal,
    );
    if (discount <= 0)
      throw badRequest('COUPON_NO_DISCOUNT', 'This coupon does not give a discount on your cart');
    return { coupon, discount };
  }

  /** Records usage inside the checkout transaction, locking the coupon row to enforce limits under concurrency. */
  async consume(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
    orderId: string,
    discount: number,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{ usageLimit: number | null; usedCount: number; perUserLimit: number }>
    >`
      SELECT "usageLimit", "usedCount", "perUserLimit" FROM "Coupon" WHERE id = ${couponId} FOR UPDATE`;
    const locked = rows[0];
    if (!locked) throw badRequest('INVALID_COUPON', 'This coupon code is not valid');
    if (locked.usageLimit != null && locked.usedCount >= locked.usageLimit)
      throw conflict('COUPON_EXHAUSTED', 'This coupon has just reached its usage limit');
    const mine = await tx.couponUsage.count({ where: { couponId, userId } });
    if (mine >= locked.perUserLimit)
      throw conflict('COUPON_USER_LIMIT', 'You have already used this coupon');
    await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    await tx.couponUsage.create({ data: { couponId, userId, orderId, discount } });
  }

  /** Give a coupon use back (order cancelled / payment failed). */
  async release(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const usages = await tx.couponUsage.findMany({ where: { orderId } });
    for (const u of usages)
      await tx.coupon.update({ where: { id: u.couponId }, data: { usedCount: { decrement: 1 } } });
    await tx.couponUsage.deleteMany({ where: { orderId } });
  }

  /** Public "available offers" shown in the cart. */
  async available(): Promise<CouponDto[]> {
    const now = new Date();
    const rows = await this.prisma.coupon.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows
      .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
      .map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        type: c.type,
        value: num(c.value),
        minOrderAmount: num(c.minOrderAmount),
        maxDiscount: c.maxDiscount == null ? null : num(c.maxDiscount),
        expiresAt: c.expiresAt?.toISOString() ?? null,
      }));
  }

  // ───────────── admin ─────────────

  async adminList(q: AdminListQuery): Promise<PagedResult<AdminCouponDto>> {
    const where: Prisma.CouponWhereInput = {
      deletedAt: null,
      ...(q.q ? { code: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.status === 'active'
        ? { isActive: true }
        : q.status === 'inactive'
          ? { isActive: false }
          : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return paged(rows.map(toAdminDto), q.page, q.limit, total);
  }

  async create(input: CouponOutput): Promise<AdminCouponDto> {
    const exists = await this.prisma.coupon.findFirst({
      where: { code: input.code, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw conflict('COUPON_EXISTS', 'A coupon with this code already exists');
    const c = await this.prisma.coupon.create({
      data: {
        code: input.code,
        description: input.description || null,
        type: input.type,
        value: input.value,
        minOrderAmount: input.minOrderAmount,
        maxDiscount: input.maxDiscount ?? null,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        isActive: input.isActive,
      },
    });
    return toAdminDto(c);
  }

  async update(id: string, input: CouponOutput): Promise<AdminCouponDto> {
    const existing = await this.prisma.coupon.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Coupon');
    if (input.code !== existing.code) {
      const clash = await this.prisma.coupon.findFirst({
        where: { code: input.code, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw conflict('COUPON_EXISTS', 'A coupon with this code already exists');
    }
    const c = await this.prisma.coupon.update({
      where: { id },
      data: {
        code: input.code,
        description: input.description || null,
        type: input.type,
        value: input.value,
        minOrderAmount: input.minOrderAmount,
        maxDiscount: input.maxDiscount ?? null,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        isActive: input.isActive,
      },
    });
    return toAdminDto(c);
  }

  async remove(id: string): Promise<void> {
    const res = await this.prisma.coupon.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (res.count === 0) throw notFound('Coupon');
  }
}
