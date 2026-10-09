import { allocateProportionally, fromPaise, toPaise } from './money';

/** GST applied on delivery / handling charges. */
export const DELIVERY_GST_RATE = 18;

export interface PricingLine {
  id: string;
  sellerId: string;
  /** Maximum retail price per unit (GST inclusive). */
  mrp: number;
  /** Selling price per unit (GST inclusive). */
  price: number;
  quantity: number;
  /** GST percentage, e.g. 18 */
  gstRate: number;
}

export interface DeliveryRules {
  flatFee: number;
  /** Orders at or above this (after discounts) ship free. 0 disables free delivery. */
  freeThreshold: number;
}

export interface PricedLine {
  id: string;
  sellerId: string;
  quantity: number;
  lineMrp: number;
  /** price × qty before coupon */
  lineTotal: number;
  /** share of the coupon discount */
  discount: number;
  /** amount payable for the line (lineTotal − discount) */
  net: number;
  /** GST contained in `net` */
  gstAmount: number;
}

export interface PricingResult {
  lines: PricedLine[];
  mrpTotal: number;
  productDiscount: number;
  subtotal: number;
  couponDiscount: number;
  deliveryFee: number;
  /** GST contained in the items *and* delivery fee. */
  gstTotal: number;
  total: number;
  /** product discount + coupon discount */
  savings: number;
  freeDeliveryThreshold: number;
  amountForFreeDelivery: number;
}

/** GST contained in a GST-inclusive amount. */
export function gstContained(inclusiveAmountPaise: number, ratePercent: number): number {
  if (ratePercent <= 0) return 0;
  return Math.round((inclusiveAmountPaise * ratePercent) / (100 + ratePercent));
}

export interface CouponRule {
  type: 'FLAT' | 'PERCENTAGE';
  value: number;
  minOrderAmount: number;
  maxDiscount?: number | null;
}

/** Discount (₹) a coupon gives on `subtotal`; 0 if the minimum order isn't met. Never exceeds subtotal. */
export function computeCouponDiscount(coupon: CouponRule, subtotal: number): number {
  if (subtotal < coupon.minOrderAmount) return 0;
  let discountPaise =
    coupon.type === 'FLAT'
      ? toPaise(coupon.value)
      : Math.floor((toPaise(subtotal) * coupon.value) / 100);
  if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
    discountPaise = Math.min(discountPaise, toPaise(coupon.maxDiscount));
  }
  discountPaise = Math.min(discountPaise, toPaise(subtotal));
  return fromPaise(Math.max(0, discountPaise));
}

/**
 * Single source of truth for cart, checkout, order and invoice totals.
 * Prices are GST-inclusive; GST is *extracted* from the amounts, never added on top.
 * The coupon discount is spread across lines in proportion to line value so that
 * per-seller sub-orders and GST remain exact.
 */
export function computePricing(
  lines: PricingLine[],
  options: { couponDiscount?: number; delivery: DeliveryRules },
): PricingResult {
  const lineTotalsPaise = lines.map((l) => toPaise(l.price) * l.quantity);
  const lineMrpPaise = lines.map((l) => toPaise(Math.max(l.mrp, l.price)) * l.quantity);
  const subtotalPaise = lineTotalsPaise.reduce((a, b) => a + b, 0);
  const mrpTotalPaise = lineMrpPaise.reduce((a, b) => a + b, 0);

  const couponPaise = Math.min(toPaise(options.couponDiscount ?? 0), subtotalPaise);
  const discountShares = allocateProportionally(couponPaise, lineTotalsPaise);

  const payableItemsPaise = subtotalPaise - couponPaise;
  const { flatFee, freeThreshold } = options.delivery;
  const qualifiesFree = freeThreshold > 0 && payableItemsPaise >= toPaise(freeThreshold);
  const deliveryPaise = lines.length === 0 || qualifiesFree ? 0 : toPaise(flatFee);

  const priced: PricedLine[] = lines.map((l, i) => {
    const lineTotal = lineTotalsPaise[i] ?? 0;
    const discount = discountShares[i] ?? 0;
    const net = lineTotal - discount;
    return {
      id: l.id,
      sellerId: l.sellerId,
      quantity: l.quantity,
      lineMrp: fromPaise(lineMrpPaise[i] ?? 0),
      lineTotal: fromPaise(lineTotal),
      discount: fromPaise(discount),
      net: fromPaise(net),
      gstAmount: fromPaise(gstContained(net, l.gstRate)),
    };
  });

  const itemsGstPaise = priced.reduce((a, l) => a + toPaise(l.gstAmount), 0);
  const gstTotalPaise = itemsGstPaise + gstContained(deliveryPaise, DELIVERY_GST_RATE);
  const totalPaise = payableItemsPaise + deliveryPaise;

  return {
    lines: priced,
    mrpTotal: fromPaise(mrpTotalPaise),
    productDiscount: fromPaise(mrpTotalPaise - subtotalPaise),
    subtotal: fromPaise(subtotalPaise),
    couponDiscount: fromPaise(couponPaise),
    deliveryFee: fromPaise(deliveryPaise),
    gstTotal: fromPaise(gstTotalPaise),
    total: fromPaise(totalPaise),
    savings: fromPaise(mrpTotalPaise - subtotalPaise + couponPaise),
    freeDeliveryThreshold: freeThreshold,
    amountForFreeDelivery:
      freeThreshold > 0 && !qualifiesFree && lines.length > 0
        ? fromPaise(Math.max(0, toPaise(freeThreshold) - payableItemsPaise))
        : 0,
  };
}

/** Intra-state supply → CGST + SGST (half each); inter-state → IGST. */
export function splitGst(gstAmount: number, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: gstAmount };
  const half = fromPaise(Math.floor(toPaise(gstAmount) / 2));
  return { cgst: half, sgst: fromPaise(toPaise(gstAmount) - toPaise(half)), igst: 0 };
}
