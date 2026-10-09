import { Prisma } from '@gk/db';
import type {
  OrderDto,
  OrderItemDto,
  OrderSummaryDto,
  PaymentDto,
  ShippingAddressSnapshot,
  StatusHistoryDto,
  SubOrderDto,
} from '@gk/types';
import { num } from '../products/products.mapper';

export const orderInclude = {
  subOrders: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      seller: { select: { id: true, storeName: true } },
      items: {
        orderBy: { id: 'asc' as const },
        include: {
          product: { select: { isReturnable: true, returnWindowDays: true } },
          review: { select: { id: true } },
          returnRequests: {
            orderBy: { createdAt: 'desc' as const },
            select: { id: true, status: true, quantity: true },
          },
        },
      },
    },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type ItemRow = OrderFull['subOrders'][number]['items'][number];

const OPEN_RETURN = ['REQUESTED', 'APPROVED', 'ESCALATED', 'PICKED_UP', 'RECEIVED'];

function toItem(i: ItemRow, deliveredAt: Date | null, subStatus: string): OrderItemDto {
  const delivered = subStatus === 'DELIVERED';
  const windowEnd = deliveredAt
    ? deliveredAt.getTime() + i.product.returnWindowDays * 86_400_000
    : 0;
  const openReturn = i.returnRequests.find((r) => OPEN_RETURN.includes(r.status));
  const latest = i.returnRequests[0];
  const pendingQty = i.returnRequests
    .filter((r) => OPEN_RETURN.includes(r.status))
    .reduce((n, r) => n + r.quantity, 0);
  return {
    id: i.id,
    productId: i.productId,
    variantId: i.variantId,
    slug: i.slug,
    name: i.name,
    variantName: i.variantName,
    image: i.image,
    quantity: i.quantity,
    mrp: num(i.mrp),
    unitPrice: num(i.unitPrice),
    discount: num(i.discount),
    gstRate: num(i.gstRate),
    gstAmount: num(i.gstAmount),
    lineTotal: num(i.lineTotal),
    returnedQty: i.returnedQty,
    canReturn:
      delivered &&
      i.product.isReturnable &&
      Date.now() <= windowEnd &&
      i.quantity - i.returnedQty - pendingQty > 0,
    canReview: delivered && !i.review,
    reviewed: Boolean(i.review),
    returnRequest:
      (openReturn ?? latest)
        ? { id: (openReturn ?? latest)!.id, status: (openReturn ?? latest)!.status }
        : null,
  };
}

export function toPaymentDto(p: {
  id: string;
  method: PaymentDto['method'];
  status: PaymentDto['status'];
  amount: Prisma.Decimal;
  providerOrderId: string | null;
  paidAt: Date | null;
}): PaymentDto {
  return {
    id: p.id,
    method: p.method,
    status: p.status,
    amount: num(p.amount),
    providerOrderId: p.providerOrderId,
    paidAt: p.paidAt?.toISOString() ?? null,
  };
}

export function toHistory(h: {
  id: string;
  status: string;
  note: string | null;
  createdAt: Date;
  subOrderId: string | null;
}): StatusHistoryDto {
  return {
    id: h.id,
    status: h.status,
    note: h.note,
    createdAt: h.createdAt.toISOString(),
    subOrderId: h.subOrderId,
  };
}

const CANCELLABLE_ORDER = ['PENDING_PAYMENT', 'PLACED', 'PROCESSING'];
const CANCELLABLE_SUB = ['PENDING', 'ACCEPTED', 'PACKED'];

export function canCancel(
  o: Pick<OrderFull, 'status'> & { subOrders: Array<{ status: string }> },
): boolean {
  return (
    CANCELLABLE_ORDER.includes(o.status) &&
    o.subOrders.every((s) => CANCELLABLE_SUB.includes(s.status) || s.status === 'CANCELLED')
  );
}

export function toOrderDto(o: OrderFull): OrderDto {
  const payment = o.payments[0];
  const subOrders: SubOrderDto[] = o.subOrders.map((s) => ({
    id: s.id,
    subOrderNumber: s.subOrderNumber,
    status: s.status,
    seller: s.seller,
    items: s.items.map((i) => toItem(i, s.deliveredAt, s.status)),
    subtotal: num(s.subtotal),
    total: num(s.total),
    courier: s.courier,
    trackingId: s.trackingId,
    trackingUrl: s.trackingUrl,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  }));
  const productDiscount = num(o.productDiscount);
  const couponDiscount = num(o.couponDiscount);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: payment?.status ?? 'PENDING',
    pricing: {
      mrpTotal: num(o.mrpTotal),
      productDiscount,
      subtotal: num(o.subtotal),
      couponDiscount,
      deliveryFee: num(o.deliveryFee),
      gstTotal: num(o.gstTotal),
      total: num(o.total),
      savings: productDiscount + couponDiscount,
      freeDeliveryThreshold: 0,
      amountForFreeDelivery: 0,
    },
    couponCode: o.couponCode,
    shippingAddress: o.shippingAddress as unknown as ShippingAddressSnapshot,
    subOrders,
    timeline: o.statusHistory.map(toHistory),
    payment: payment ? toPaymentDto(payment) : null,
    canCancel: canCancel(o),
    hasInvoice: Boolean(o.invoiceNumber),
    invoiceNumber: o.invoiceNumber,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    placedAt: o.placedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

export function toOrderSummary(o: {
  id: string;
  orderNumber: string;
  status: OrderSummaryDto['status'];
  paymentMethod: OrderSummaryDto['paymentMethod'];
  total: Prisma.Decimal;
  createdAt: Date;
  payments: Array<{ status: OrderSummaryDto['paymentStatus'] }>;
  items: Array<{ name: string; image: string | null; quantity: number }>;
}): OrderSummaryDto {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.payments[0]?.status ?? 'PENDING',
    total: num(o.total),
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    previewImages: o.items
      .map((i) => i.image)
      .filter((x): x is string => Boolean(x))
      .slice(0, 4),
    firstItemName: o.items[0]?.name ?? '',
    createdAt: o.createdAt.toISOString(),
  };
}
