import { describe, expect, it } from 'vitest';
import {
  computeCouponDiscount,
  computePricing,
  gstContained,
  splitGst,
  type PricingLine,
} from './pricing';

const delivery = { flatFee: 49, freeThreshold: 499 };
const line = (over: Partial<PricingLine> = {}): PricingLine => ({
  id: 'l1',
  sellerId: 's1',
  mrp: 1000,
  price: 800,
  quantity: 1,
  gstRate: 18,
  ...over,
});
const r2 = (n: number) => Math.round(n * 100) / 100;

describe('gstContained', () => {
  it('extracts GST from an inclusive amount (paise)', () => {
    expect(gstContained(118000, 18)).toBe(18000);
    expect(gstContained(10500, 5)).toBe(500);
  });
  it('is zero for exempt goods', () => {
    expect(gstContained(5000, 0)).toBe(0);
  });
});

describe('computeCouponDiscount', () => {
  it('applies a flat coupon', () => {
    expect(computeCouponDiscount({ type: 'FLAT', value: 100, minOrderAmount: 0 }, 900)).toBe(100);
  });
  it('applies a percentage coupon, honouring the cap', () => {
    expect(
      computeCouponDiscount(
        { type: 'PERCENTAGE', value: 20, minOrderAmount: 0, maxDiscount: 150 },
        1000,
      ),
    ).toBe(150);
    expect(computeCouponDiscount({ type: 'PERCENTAGE', value: 10, minOrderAmount: 0 }, 999)).toBe(
      99.9,
    );
  });
  it('enforces the minimum order amount', () => {
    expect(computeCouponDiscount({ type: 'FLAT', value: 100, minOrderAmount: 1000 }, 999)).toBe(0);
  });
  it('never discounts more than the subtotal', () => {
    expect(computeCouponDiscount({ type: 'FLAT', value: 500, minOrderAmount: 0 }, 300)).toBe(300);
  });
});

describe('computePricing', () => {
  it('computes totals for one line with free delivery', () => {
    const r = computePricing([line({ quantity: 2 })], { delivery });
    expect(r.mrpTotal).toBe(2000);
    expect(r.subtotal).toBe(1600);
    expect(r.productDiscount).toBe(400);
    expect(r.deliveryFee).toBe(0);
    expect(r.total).toBe(1600);
    expect(r.savings).toBe(400);
    expect(r.amountForFreeDelivery).toBe(0);
    // prices are GST-inclusive: GST is carved out of the total, never added on top
    expect(r.gstTotal).toBe(r2(1600 - 1600 / 1.18));
  });

  it('charges delivery below the free threshold and reports the gap', () => {
    const r = computePricing([line({ mrp: 300, price: 250 })], { delivery });
    expect(r.deliveryFee).toBe(49);
    expect(r.total).toBe(299);
    expect(r.amountForFreeDelivery).toBe(249);
    expect(r.gstTotal).toBeCloseTo(r2(250 - 250 / 1.18) + r2(49 - 49 / 1.18), 2);
  });

  it('spreads a coupon across lines so net amounts add up exactly', () => {
    const lines = [
      line({ id: 'a', price: 333.33, mrp: 400 }),
      line({ id: 'b', sellerId: 's2', price: 666.67, mrp: 800, gstRate: 5 }),
    ];
    const r = computePricing(lines, { couponDiscount: 100, delivery });
    expect(r.couponDiscount).toBe(100);
    expect(r2(r.lines.reduce((s, l) => s + l.discount, 0))).toBe(100);
    expect(r2(r.lines.reduce((s, l) => s + l.net, 0))).toBe(r2(r.total - r.deliveryFee));
    expect(r.total).toBe(900);
  });

  it('lets a coupon push the order under the free delivery threshold', () => {
    const r = computePricing([line({ mrp: 600, price: 520 })], { couponDiscount: 100, delivery });
    expect(r.deliveryFee).toBe(49);
    expect(r.total).toBe(469);
  });

  it('caps the coupon at the subtotal', () => {
    const r = computePricing([line({ price: 100, mrp: 100 })], { couponDiscount: 500, delivery });
    expect(r.couponDiscount).toBe(100);
    expect(r.total).toBe(49);
  });

  it('handles an empty cart', () => {
    const r = computePricing([], { delivery });
    expect(r.total).toBe(0);
    expect(r.deliveryFee).toBe(0);
    expect(r.amountForFreeDelivery).toBe(0);
  });

  it('treats a zero threshold as never free', () => {
    const r = computePricing([line({ price: 5000, mrp: 5000 })], {
      delivery: { flatFee: 40, freeThreshold: 0 },
    });
    expect(r.deliveryFee).toBe(40);
  });

  it('never lets MRP drop below the selling price', () => {
    const r = computePricing([line({ mrp: 90, price: 100 })], { delivery });
    expect(r.mrpTotal).toBe(100);
    expect(r.productDiscount).toBe(0);
  });
});

describe('splitGst', () => {
  it('splits intra-state GST into CGST + SGST that add up', () => {
    const r = splitGst(18.01, true);
    expect(r.igst).toBe(0);
    expect(r2(r.cgst + r.sgst)).toBe(18.01);
  });
  it('uses IGST across states', () => {
    expect(splitGst(18, false)).toEqual({ cgst: 0, sgst: 0, igst: 18 });
  });
});
