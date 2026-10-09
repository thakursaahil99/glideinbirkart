import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@gk/db';
import type { OrderStatus } from '@gk/types';
import { toPaise } from '@gk/utils';
import type { AppConfig } from '../../config/config.types';
import { badRequest, conflict } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { QueueNames, QueueService } from '../../infra/queue.service';
import { CouponsService } from '../coupons/coupons.service';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/mail.templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentGateway } from '../payments/gateway';
import { ProductAggregatesService } from '../products/product-aggregates.service';
import { SellerProductsService } from '../products/seller-products.service';
import { num } from '../products/products.mapper';

type Tx = Prisma.TransactionClient;
export interface StockLine {
  variantId: string;
  quantity: number;
}

const STATUS_COPY: Partial<
  Record<OrderStatus, { headline: string; detail: (n: string) => string }>
> = {
  PROCESSING: {
    headline: 'Your order is being prepared',
    detail: (n) => `The seller is packing order ${n}.`,
  },
  SHIPPED: {
    headline: 'Your order has shipped',
    detail: (n) => `Order ${n} is on its way. Track it from your orders page.`,
  },
  DELIVERED: {
    headline: 'Your order was delivered',
    detail: (n) => `Order ${n} has been delivered. We hope you love it — leave a review!`,
  },
  CANCELLED: {
    headline: 'Your order was cancelled',
    detail: (n) =>
      `Order ${n} has been cancelled. Any online payment will be refunded to the original method.`,
  },
};

@Injectable()
export class OrderLifecycleService {
  private readonly log = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly coupons: CouponsService,
    private readonly gateway: PaymentGateway,
    private readonly aggregates: ProductAggregatesService,
    private readonly sellerProducts: SellerProductsService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  private webUrl(path: string) {
    return `${this.config.get('WEB_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  // ───────────── stock primitives (always race-safe single-statement updates) ─────────────

  /** quantity − reserved ≥ n → reserved += n. Throws 409 when a line can't be fulfilled. */
  async reserve(tx: Tx, lines: StockLine[]): Promise<void> {
    for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const n = await tx.$executeRaw`
        UPDATE "Inventory" SET reserved = reserved + ${l.quantity}, "updatedAt" = now()
        WHERE "variantId" = ${l.variantId} AND quantity - reserved >= ${l.quantity}`;
      if (n === 0) {
        const v = await tx.productVariant.findUnique({
          where: { id: l.variantId },
          select: { name: true, product: { select: { name: true } } },
        });
        throw conflict(
          'OUT_OF_STOCK',
          `${v?.product.name ?? 'An item'}${v?.name ? ` (${v.name})` : ''} just went out of stock or has fewer units than you asked for`,
        );
      }
    }
  }

  /** Reserved units become sold. */
  async commit(tx: Tx, lines: StockLine[]): Promise<void> {
    for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const n = await tx.$executeRaw`
        UPDATE "Inventory" SET quantity = quantity - ${l.quantity}, reserved = reserved - ${l.quantity}, "updatedAt" = now()
        WHERE "variantId" = ${l.variantId} AND reserved >= ${l.quantity} AND quantity >= ${l.quantity}`;
      if (n === 0) throw conflict('STOCK_STATE_ERROR', 'Reserved stock is no longer available');
    }
  }

  async release(tx: Tx, lines: StockLine[]): Promise<void> {
    for (const l of lines) {
      await tx.$executeRaw`
        UPDATE "Inventory" SET reserved = GREATEST(reserved - ${l.quantity}, 0), "updatedAt" = now()
        WHERE "variantId" = ${l.variantId}`;
    }
  }

  async restock(tx: Tx, lines: StockLine[]): Promise<void> {
    for (const l of lines) {
      await tx.$executeRaw`UPDATE "Inventory" SET quantity = quantity + ${l.quantity}, "updatedAt" = now() WHERE "variantId" = ${l.variantId}`;
    }
  }

  private async refreshProducts(productIds: string[]) {
    const ids = [...new Set(productIds)];
    await this.aggregates.recomputeStock(ids);
    await this.aggregates.invalidateDetail(ids);
  }

  // ───────────── history & status ─────────────

  history(
    tx: Tx,
    input: {
      orderId: string;
      subOrderId?: string | null;
      status: string;
      note?: string | null;
      actorId?: string | null;
    },
  ) {
    return tx.orderStatusHistory.create({
      data: {
        orderId: input.orderId,
        subOrderId: input.subOrderId ?? null,
        status: input.status,
        note: input.note ?? null,
        actorId: input.actorId ?? null,
      },
    });
  }

  /** Derive the customer-facing order status from its seller sub-orders. */
  async recomputeStatus(tx: Tx, orderId: string, actorId?: string): Promise<OrderStatus> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { subOrders: { select: { status: true } }, payments: true },
    });
    if (order.status === 'PENDING_PAYMENT' || order.status === 'PAYMENT_FAILED')
      return order.status;
    const active = order.subOrders.map((s) => s.status).filter((s) => s !== 'CANCELLED');
    let next: OrderStatus;
    if (active.length === 0) next = 'CANCELLED';
    else if (active.every((s) => s === 'DELIVERED' || s === 'RETURNED')) next = 'DELIVERED';
    else if (active.some((s) => s === 'SHIPPED' || s === 'DELIVERED')) next = 'SHIPPED';
    else if (active.some((s) => s === 'ACCEPTED' || s === 'PACKED')) next = 'PROCESSING';
    else next = 'PLACED';

    if (next !== order.status) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: next, ...(next === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
      });
      await this.history(tx, { orderId, status: next, actorId, note: null });
    }
    // Cash on Delivery is collected when the parcel is handed over
    if (next === 'DELIVERED') {
      await tx.payment.updateMany({
        where: { orderId, method: 'COD', status: 'PENDING' },
        data: { status: 'PAID', paidAt: new Date() },
      });
    }
    return next;
  }

  // ───────────── confirmation (online payment verified / COD placed) ─────────────

  /**
   * Moves a pending order to PLACED inside an existing transaction:
   * reserved stock is committed, sold counters bumped, the purchased cart lines cleared.
   */
  async confirmInTx(tx: Tx, orderId: string, note: string): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    await this.commit(
      tx,
      order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    );
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'PLACED', placedAt: new Date(), expiresAt: null },
    });
    await this.history(tx, { orderId, status: 'PLACED', note });

    const sold = new Map<string, number>();
    order.items.forEach((i) => sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.quantity));
    for (const [productId, qty] of sold)
      await tx.product.update({
        where: { id: productId },
        data: { soldCount: { increment: qty } },
      });

    const cart = await tx.cart.findUnique({
      where: { userId: order.userId },
      select: { id: true },
    });
    if (cart) {
      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          savedForLater: false,
          variantId: { in: order.items.map((i) => i.variantId) },
        },
      });
      await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    }
  }

  /** Notifications, emails, invoice generation — run after the confirming transaction commits. */
  async afterPlaced(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          user: true,
          items: true,
          subOrders: { include: { seller: { select: { userId: true, storeName: true } } } },
        },
      });
      await this.queue.remove(QueueNames.stockExpiry, `expire-${orderId}`);
      await this.refreshProducts(order.items.map((i) => i.productId));
      await this.sellerProducts.checkLowStock(order.items.map((i) => i.variantId));

      await this.notifications.notify(order.userId, {
        type: 'ORDER',
        title: 'Order placed',
        body: `We received your order ${order.orderNumber}.`,
        data: { orderId, link: `/account/orders/${orderId}` },
      });
      for (const so of order.subOrders) {
        await this.notifications.notify(so.seller.userId, {
          type: 'ORDER',
          title: 'New order received',
          body: `Order ${so.subOrderNumber} — accept it to start fulfilment.`,
          data: { subOrderId: so.id, link: `/seller/orders/${so.id}` },
        });
      }
      if (order.user.email) {
        await this.mail.send({
          to: order.user.email,
          ...mailTemplates.orderConfirmation({
            name: order.user.name,
            orderNumber: order.orderNumber,
            total: num(order.total),
            method: order.paymentMethod,
            items: order.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              lineTotal: num(i.lineTotal) - num(i.discount),
            })),
            url: this.webUrl(`/account/orders/${orderId}`),
          }),
        });
      }
      await this.queue.add(QueueNames.invoices, { orderId });
    } catch (err) {
      this.log.error(`afterPlaced(${orderId}) failed: ${(err as Error).message}`);
    }
  }

  /** Customer-visible progress notification (+ email for the important states). */
  async notifyStatus(orderId: string, status: OrderStatus): Promise<void> {
    const copy = STATUS_COPY[status];
    if (!copy) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });
    if (!order) return;
    await this.notifications.notify(order.userId, {
      type: 'ORDER',
      title: copy.headline,
      body: copy.detail(order.orderNumber),
      data: { orderId, link: `/account/orders/${orderId}` },
    });
    if (order.user.email && ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(status)) {
      await this.mail.send({
        to: order.user.email,
        ...mailTemplates.orderStatus({
          name: order.user.name,
          orderNumber: order.orderNumber,
          headline: copy.headline,
          detail: copy.detail(order.orderNumber),
          url: this.webUrl(`/account/orders/${orderId}`),
        }),
      });
    }
  }

  // ───────────── cancellation / expiry ─────────────

  /**
   * Cancel a whole order. Before payment → reservation is released.
   * After confirmation → stock is returned and, if paid online, a refund is issued.
   */
  async cancelOrder(
    orderId: string,
    opts: { reason: string; actorId?: string; actorLabel: string },
  ): Promise<void> {
    let refundId = null as string | null;
    let productIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, subOrders: true, payments: true },
      });
      if (['CANCELLED', 'PAYMENT_FAILED', 'DELIVERED'].includes(order.status))
        throw badRequest(
          'NOT_CANCELLABLE',
          `This order is already ${order.status.toLowerCase().replace('_', ' ')}`,
        );
      if (order.subOrders.some((s) => ['SHIPPED', 'DELIVERED'].includes(s.status)))
        throw badRequest(
          'ALREADY_SHIPPED',
          'Part of this order has already shipped. Please request a return after delivery.',
        );

      const wasConfirmed = order.status !== 'PENDING_PAYMENT';
      const live = order.items.filter(
        (i) => order.subOrders.find((s) => s.id === i.subOrderId)?.status !== 'CANCELLED',
      );
      const lines = live.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      if (wasConfirmed) await this.restock(tx, lines);
      else await this.release(tx, lines);
      productIds = order.items.map((i) => i.productId);

      await tx.subOrder.updateMany({
        where: { orderId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: opts.reason },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: opts.reason,
          expiresAt: null,
        },
      });
      await this.history(tx, {
        orderId,
        status: 'CANCELLED',
        note: `${opts.actorLabel}: ${opts.reason}`,
        actorId: opts.actorId,
      });
      await this.coupons.release(tx, orderId);

      const payment = order.payments[0];
      if (payment) {
        if (payment.status === 'PAID' && payment.method === 'RAZORPAY') {
          const already = await tx.refund.aggregate({ where: { orderId }, _sum: { amount: true } });
          const remaining = num(payment.amount) - num(already._sum.amount);
          if (remaining > 0) {
            const refund = await tx.refund.create({
              data: {
                orderId,
                paymentId: payment.id,
                amount: remaining,
                reason: opts.reason,
                notes: 'Order cancelled',
              },
            });
            refundId = refund.id;
          }
        } else if (payment.status === 'PENDING') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED', failureReason: 'Order cancelled' },
          });
        }
      }
    });

    if (refundId) await this.processRefund(refundId);
    await this.refreshProducts(productIds);
    await this.queue.remove(QueueNames.stockExpiry, `expire-${orderId}`);
    await this.notifyStatus(orderId, 'CANCELLED');
  }

  /** Cancel one seller's sub-order (seller declines / cannot fulfil) and refund its share if prepaid. */
  async cancelSubOrder(
    subOrderId: string,
    opts: { reason: string; actorId?: string; actorLabel: string },
  ): Promise<void> {
    let refundId = null as string | null;
    let orderId = '';
    let productIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const sub = await tx.subOrder.findUniqueOrThrow({
        where: { id: subOrderId },
        include: { items: true, order: { include: { payments: true } } },
      });
      if (!['PENDING', 'ACCEPTED', 'PACKED'].includes(sub.status))
        throw badRequest('NOT_CANCELLABLE', 'This order can no longer be cancelled');
      orderId = sub.orderId;
      productIds = sub.items.map((i) => i.productId);
      const lines = sub.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      if (sub.order.status === 'PENDING_PAYMENT') await this.release(tx, lines);
      else await this.restock(tx, lines);

      await tx.subOrder.update({
        where: { id: subOrderId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: opts.reason },
      });
      await this.history(tx, {
        orderId,
        subOrderId,
        status: 'CANCELLED',
        note: `${opts.actorLabel}: ${opts.reason}`,
        actorId: opts.actorId,
      });
      const payment = sub.order.payments[0];
      if (payment?.status === 'PAID' && payment.method === 'RAZORPAY') {
        const refund = await tx.refund.create({
          data: {
            orderId,
            paymentId: payment.id,
            amount: sub.total,
            reason: opts.reason,
            notes: `Sub-order ${sub.subOrderNumber} cancelled`,
          },
        });
        refundId = refund.id;
      }
      await this.recomputeStatus(tx, orderId, opts.actorId);
    });
    if (refundId) await this.processRefund(refundId);
    await this.refreshProducts(productIds);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, userId: true, orderNumber: true },
    });
    if (order) {
      await this.notifications.notify(order.userId, {
        type: 'ORDER',
        title: 'Part of your order was cancelled',
        body: `The seller could not fulfil an item in ${order.orderNumber}. ${refundId ? 'Your refund is on its way.' : ''}`.trim(),
        data: { orderId, link: `/account/orders/${orderId}` },
      });
    }
  }

  /** Payment window elapsed (BullMQ delayed job). Releases reserved stock. */
  async expireIfUnpaid(orderId: string): Promise<boolean> {
    let expired = false;
    let productIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || order.status !== 'PENDING_PAYMENT') return;
      if (order.expiresAt && order.expiresAt > new Date()) return;
      await this.release(
        tx,
        order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      );
      productIds = order.items.map((i) => i.productId);
      await tx.subOrder.updateMany({
        where: { orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Payment not completed',
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAYMENT_FAILED',
          cancelledAt: new Date(),
          cancelReason: 'Payment window expired',
          expiresAt: null,
        },
      });
      await tx.payment.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'Payment window expired' },
      });
      await this.coupons.release(tx, orderId);
      await this.history(tx, {
        orderId,
        status: 'PAYMENT_FAILED',
        note: 'Payment not completed in time — reserved stock released',
      });
      expired = true;
    });
    if (expired) {
      await this.refreshProducts(productIds);
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true, orderNumber: true },
      });
      if (order) {
        await this.notifications.notify(order.userId, {
          type: 'PAYMENT',
          title: 'Order expired',
          body: `Payment for ${order.orderNumber} was not completed, so the items were released.`,
          data: { orderId },
        });
      }
    }
    return expired;
  }

  // ───────────── refunds ─────────────

  /** Execute a PENDING refund through the payment gateway (or flag COD refunds for manual payout). */
  async processRefund(refundId: string): Promise<void> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true, order: { include: { user: true } } },
    });
    if (!refund || refund.status !== 'PENDING') return;
    try {
      if (
        refund.payment?.provider === 'razorpay' &&
        refund.payment.providerPaymentId &&
        refund.payment.status !== 'PENDING'
      ) {
        const res = await this.gateway.refund({
          paymentId: refund.payment.providerPaymentId,
          amountPaise: toPaise(num(refund.amount)),
          notes: { refundId, order: refund.order.orderNumber },
        });
        await this.prisma.refund.update({
          where: { id: refundId },
          data: {
            status: res.status === 'processed' ? 'PROCESSED' : 'PENDING',
            providerRefundId: res.id,
            processedAt: new Date(),
          },
        });
      } else {
        // COD (or unpaid) → no gateway movement; finance pays the customer manually
        await this.prisma.refund.update({
          where: { id: refundId },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            notes: `${refund.notes ?? ''} · manual payout (COD)`.trim(),
          },
        });
      }
      if (refund.payment) {
        const totals = await this.prisma.refund.aggregate({
          where: { paymentId: refund.payment.id, status: { not: 'FAILED' } },
          _sum: { amount: true },
        });
        const refunded = num(totals._sum.amount);
        await this.prisma.payment.update({
          where: { id: refund.payment.id },
          data: {
            status: refunded >= num(refund.payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });
      }
      await this.notifications.notify(refund.order.userId, {
        type: 'PAYMENT',
        title: 'Refund initiated',
        body: `₹${num(refund.amount).toLocaleString('en-IN')} for order ${refund.order.orderNumber} is being refunded.`,
        data: { orderId: refund.orderId, link: `/account/orders/${refund.orderId}` },
      });
    } catch (err) {
      this.log.error(`refund ${refundId} failed: ${(err as Error).message}`);
      await this.prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'FAILED',
          notes: `${refund.notes ?? ''} · ${(err as Error).message}`.slice(0, 480),
        },
      });
    }
  }
}
