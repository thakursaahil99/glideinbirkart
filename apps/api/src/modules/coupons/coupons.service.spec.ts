import { AppException } from '../../common/errors';
import type { PrismaService } from '../../infra/prisma.service';
import { CouponsService } from './coupons.service';

const HOUR = 3_600_000;

function coupon(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    code: 'SAVE100',
    type: 'FLAT',
    value: 100,
    minOrderAmount: 500,
    maxDiscount: null,
    usageLimit: null,
    usedCount: 0,
    perUserLimit: 1,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    ...over,
  };
}

function service(row: unknown, usedByUser = 0) {
  const db = {
    coupon: { findFirst: jest.fn().mockResolvedValue(row) },
    couponUsage: { count: jest.fn().mockResolvedValue(usedByUser) },
  };
  return {
    svc: new CouponsService({} as PrismaService),
    db: db as unknown as PrismaService,
    raw: db,
  };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof AppException ? e.code : String(e);
  }
}

describe('CouponsService.validate', () => {
  it('applies a valid coupon', async () => {
    const { svc, db } = service(coupon());
    const r = await svc.validate('save100', 'u1', 1000, db);
    expect(r.discount).toBe(100);
  });

  it('upper-cases the code before looking it up', async () => {
    const { svc, db, raw } = service(coupon());
    await svc.validate('save100', 'u1', 1000, db);
    expect(raw.coupon.findFirst).toHaveBeenCalledWith({
      where: { code: 'SAVE100', deletedAt: null },
    });
  });

  it.each([
    ['unknown code', null, 'INVALID_COUPON'],
    ['disabled coupon', coupon({ isActive: false }), 'INVALID_COUPON'],
    ['not started', coupon({ startsAt: new Date(Date.now() + HOUR) }), 'COUPON_NOT_STARTED'],
    ['expired', coupon({ expiresAt: new Date(Date.now() - HOUR) }), 'COUPON_EXPIRED'],
    ['usage limit reached', coupon({ usageLimit: 5, usedCount: 5 }), 'COUPON_EXHAUSTED'],
  ])('rejects %s', async (_name, row, expected) => {
    const { svc, db } = service(row);
    expect(await codeOf(svc.validate('SAVE100', 'u1', 1000, db))).toBe(expected);
  });

  it('rejects when the user already used it up to the per-user limit', async () => {
    const { svc, db } = service(coupon({ perUserLimit: 1 }), 1);
    expect(await codeOf(svc.validate('SAVE100', 'u1', 1000, db))).toBe('COUPON_USER_LIMIT');
  });

  it('tells the shopper how much more to add for the minimum order', async () => {
    const { svc, db } = service(coupon({ minOrderAmount: 1000 }));
    await expect(svc.validate('SAVE100', 'u1', 700, db)).rejects.toMatchObject({
      code: 'COUPON_MIN_ORDER',
      message: expect.stringContaining('₹300'),
    });
  });

  it('caps percentage coupons at maxDiscount', async () => {
    const { svc, db } = service(
      coupon({ type: 'PERCENTAGE', value: 50, maxDiscount: 200, minOrderAmount: 0 }),
    );
    expect((await svc.validate('SAVE100', 'u1', 2000, db)).discount).toBe(200);
  });
});
