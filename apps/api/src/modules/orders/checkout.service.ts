import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { Prisma } from '@gk/db';
import type { CheckoutResult } from '@gk/types';
import { computePricing, gstContained, toPaise, fromPaise, type PricingLine } from '@gk/utils';
import type { CheckoutInput } from '@gk/validators';
import type { AppConfig } from '../../config/config.types';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { QueueNames, QueueService } from '../../infra/queue.service';
import { CartService } from '../cart/cart.service';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentGateway } from '../payments/gateway';
import { available, num } from '../products/products.mapper';
import { DeliveryService } from '../settings/delivery.service';
import { SettingsService } from '../settings/settings.service';
import { CommissionService } from './commission.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { orderInclude, toOrderDto } from './orders.mapper';

const cartVariantInclude = {
  inventory: true,
  images: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
  product: {
    include: {
      category: { select: { id: true, path: true, isActive: true } },
      seller: { select: { id: true, status: true, storeName: true, pickupState: true } },
      images: {
        where: { variantId: null },
        orderBy: { position: 'asc' as const },
        take: 1,
        select: { url: true },
      },
    },
  },
} satisfies Prisma.ProductVariantInclude;

/** "GK" + yymmdd + 6 random digits — short enough to read over the phone. */
export function generateOrderNumber(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `GK${yy}${mm}${dd}${randomInt(100000, 1000000)}`;
}

@Injectable()
export class CheckoutService {
  private readonly log = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly settings: SettingsService,
    private readonly delivery: DeliveryService,
    private readonly commission: CommissionService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly gateway: PaymentGateway,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  /**
   * Checkout. Inside ONE transaction: validate stock → reserve stock → create order, per-seller
   * sub-orders, items and the payment record (COD is confirmed immediately). Online payments get a
   * gateway order afterwards and a delayed BullMQ job that releases the reservation if unpaid.
   */
  async placeOrder(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const address = await this.prisma.address.findFirst({
      where: { id: input.addressId, userId, deletedAt: null },
    });
    if (!address) throw badRequest('INVALID_ADDRESS', 'Choose a delivery address');

    const [settings, pin] = await Promise.all([
      this.settings.get(),
      this.delivery.check(address.pincode),
    ]);
    if (!pin.serviceable) throw badRequest('PINCODE_UNSERVICEABLE', pin.message);

    // A user can only hold one open online payment at a time — free the previous reservation first.
    const stale = await this.prisma.order.findMany({
      where: { userId, status: 'PENDING_PAYMENT' },
      select: { id: true },
    });
    for (const s of stale)
      await this.lifecycle
        .cancelOrder(s.id, { reason: 'Replaced by a new checkout', actorLabel: 'System' })
        .catch(() => undefined);

    const cartView = await this.cart.view({ userId });
    if (cartView.items.length === 0) throw badRequest('EMPTY_CART', 'Your cart is empty');
    const blocked = cartView.items.filter((i) => i.issue);
    if (blocked.length) {
      throw conflict(
        'CART_ISSUES',
        `${blocked[0]?.name}: ${blocked[0]?.issue}. Update your cart to continue.`,
        blocked.map((b) => ({ path: b.variantId, message: `${b.name}: ${b.issue}` })),
      );
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: cartView.items.map((i) => i.variantId) } },
      include: cartVariantInclude,
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const resolver = await this.commission.resolver();

    // Pricing is recomputed from the database (never trust cart snapshots).
    const lines: PricingLine[] = [];
    for (const ci of cartView.items) {
      const v = variantById.get(ci.variantId);
      if (
        !v ||
        v.product.status !== 'ACTIVE' ||
        v.product.seller.status !== 'APPROVED' ||
        !v.isActive
      )
        throw conflict('ITEM_UNAVAILABLE', `${ci.name} is no longer available`);
      if (available(v.inventory) < ci.quantity)
        throw conflict('OUT_OF_STOCK', `${ci.name} has fewer units than you asked for`);
      lines.push({
        id: v.id,
        sellerId: v.product.sellerId,
        mrp: num(v.mrp),
        price: num(v.price),
        quantity: ci.quantity,
        gstRate: num(v.product.gstRate),
      });
    }
    const delivery = {
      flatFee: settings.deliveryFee,
      freeThreshold: settings.freeDeliveryThreshold,
    };
    const preCoupon = computePricing(lines, { delivery });

    let couponId: string | null = null;
    let couponCode: string | null = null;
    let couponDiscount = 0;
    const appliedCode = await this.cart.store({ userId }).couponCode();
    if (appliedCode) {
      const res = await this.coupons.validate(appliedCode, userId, preCoupon.subtotal);
      couponId = res.coupon.id;
      couponCode = res.coupon.code;
      couponDiscount = res.discount;
    }
    const pricing = computePricing(lines, { couponDiscount, delivery });

    if (input.paymentMethod === 'RAZORPAY' && !settings.onlinePaymentsEnabled)
      throw badRequest(
        'ONLINE_PAYMENT_DISABLED',
        'Online payment is not available. Please choose Cash on Delivery.',
      );
    if (input.paymentMethod === 'COD') {
      if (!settings.codEnabled || pin.codAvailable === false)
        throw badRequest('COD_UNAVAILABLE', 'Cash on Delivery is not available for this order');
      // The cap only exists to push big orders to prepaid; a cash-only store has no alternative.
      if (settings.onlinePaymentsEnabled && pricing.total > settings.codMaxAmount)
        throw badRequest(
          'COD_LIMIT',
          `Cash on Delivery is available up to ₹${settings.codMaxAmount.toLocaleString('en-IN')}. Please pay online.`,
        );
    }

    const online = input.paymentMethod === 'RAZORPAY';
    const windowMs = this.config.get('ORDER_PAYMENT_WINDOW_MINUTES', { infer: true }) * 60_000;
    const snapshot = {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
    };

    // group priced lines by seller
    const bySeller = new Map<
      string,
      Array<{
        pl: (typeof pricing.lines)[number];
        v: NonNullable<ReturnType<typeof variantById.get>>;
      }>
    >();
    for (const pl of pricing.lines) {
      const v = variantById.get(pl.id) as NonNullable<ReturnType<typeof variantById.get>>;
      bySeller.set(v.product.sellerId, [...(bySeller.get(v.product.sellerId) ?? []), { pl, v }]);
    }

    let orderId = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        orderId = await this.prisma.$transaction(
          async (tx) => {
            await this.lifecycle.reserve(
              tx,
              lines.map((l) => ({ variantId: l.id, quantity: l.quantity })),
            );

            const orderNumber = generateOrderNumber();
            const order = await tx.order.create({
              data: {
                orderNumber,
                userId,
                status: 'PENDING_PAYMENT',
                paymentMethod: input.paymentMethod,
                shippingAddress: snapshot as Prisma.InputJsonValue,
                couponId,
                couponCode,
                mrpTotal: pricing.mrpTotal,
                productDiscount: pricing.productDiscount,
                subtotal: pricing.subtotal,
                couponDiscount: pricing.couponDiscount,
                deliveryFee: pricing.deliveryFee,
                gstTotal: pricing.gstTotal,
                total: pricing.total,
                notes: input.notes,
                expiresAt: online ? new Date(Date.now() + windowMs) : null,
              },
            });
            if (couponId)
              await this.coupons.consume(tx, couponId, userId, order.id, couponDiscount);

            let n = 1;
            for (const [sellerId, entries] of bySeller) {
              let subSubtotal = 0;
              let subDiscount = 0;
              let subGst = 0;
              let commissionPaise = 0;
              let taxablePaise = 0;
              const itemRows: Prisma.OrderItemCreateManyInput[] = [];
              const sub = await tx.subOrder.create({
                data: {
                  orderId: order.id,
                  sellerId,
                  subOrderNumber: `${orderNumber}-${n++}`,
                  subtotal: 0,
                  gstTotal: 0,
                  total: 0,
                },
              });
              for (const { pl, v } of entries) {
                const rate = resolver.rateFor(sellerId, v.product.category.path);
                // commission is charged on the pre-coupon taxable value (coupons are platform-funded)
                const taxable =
                  toPaise(pl.lineTotal) -
                  gstContained(toPaise(pl.lineTotal), num(v.product.gstRate));
                const commission = Math.round((taxable * rate) / 100);
                commissionPaise += commission;
                taxablePaise += taxable;
                subSubtotal += toPaise(pl.lineTotal);
                subDiscount += toPaise(pl.discount);
                subGst += toPaise(pl.gstAmount);
                itemRows.push({
                  orderId: order.id,
                  subOrderId: sub.id,
                  sellerId,
                  productId: v.productId,
                  variantId: v.id,
                  name: v.product.name,
                  variantName: v.name,
                  sku: v.sku,
                  slug: v.product.slug,
                  image: v.images[0]?.url ?? v.product.images[0]?.url ?? null,
                  quantity: pl.quantity,
                  mrp: num(v.mrp),
                  unitPrice: num(v.price),
                  discount: pl.discount,
                  gstRate: num(v.product.gstRate),
                  gstAmount: pl.gstAmount,
                  lineTotal: pl.lineTotal,
                });
              }
              await tx.orderItem.createMany({ data: itemRows });
              await tx.subOrder.update({
                where: { id: sub.id },
                data: {
                  subtotal: fromPaise(subSubtotal),
                  discount: fromPaise(subDiscount),
                  gstTotal: fromPaise(subGst),
                  total: fromPaise(subSubtotal - subDiscount),
                  commissionRate:
                    taxablePaise > 0
                      ? Math.round((commissionPaise / taxablePaise) * 10000) / 100
                      : 0,
                  commissionAmount: fromPaise(commissionPaise),
                  sellerEarning: fromPaise(subSubtotal - commissionPaise),
                },
              });
            }

            await tx.payment.create({
              data: {
                orderId: order.id,
                method: input.paymentMethod,
                amount: pricing.total,
                provider: online ? 'razorpay' : 'cod',
                status: 'PENDING',
              },
            });
            await this.lifecycle.history(tx, {
              orderId: order.id,
              status: 'PENDING_PAYMENT',
              note: online ? 'Awaiting payment' : 'Order received',
              actorId: userId,
            });
            if (!online)
              await this.lifecycle.confirmInTx(tx, order.id, 'Order placed — Cash on Delivery');
            return order.id;
          },
          { timeout: 20_000, maxWait: 8_000 },
        );
        break;
      } catch (err) {
        // order number collision (extremely rare) → retry with a fresh number
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.target).includes('orderNumber') &&
          attempt < 3
        )
          continue;
        throw err;
      }
    }

    if (!online) {
      await this.lifecycle.afterPlaced(orderId);
      return { order: await this.load(orderId) };
    }

    // Online: create the gateway order, remember it, and schedule the reservation expiry.
    try {
      const gatewayOrder = await this.gateway.createOrder({
        amountPaise: toPaise(pricing.total),
        receipt: orderId,
        notes: { orderId, userId },
      });
      await this.prisma.payment.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { providerOrderId: gatewayOrder.id },
      });
      await this.queue.add(
        QueueNames.stockExpiry,
        { orderId },
        { delay: windowMs + 5_000, jobId: `expire-${orderId}`, jobName: 'expire' },
      );
      return {
        order: await this.load(orderId),
        razorpay: {
          keyId: this.gateway.keyId,
          orderId: gatewayOrder.id,
          amount: gatewayOrder.amountPaise,
          currency: gatewayOrder.currency,
          name: 'Glideinbir Kart',
          description: `Order ${(await this.load(orderId)).orderNumber}`,
          prefill: {
            name: user.name,
            email: user.email ?? '',
            contact: user.phone ?? address.phone,
          },
          mock: this.gateway.mock,
        },
      };
    } catch (err) {
      this.log.error(`gateway order failed for ${orderId}: ${(err as Error).message}`);
      await this.lifecycle
        .cancelOrder(orderId, { reason: 'Payment gateway unavailable', actorLabel: 'System' })
        .catch(() => undefined);
      throw new BadGatewayException('Payment gateway is unavailable right now. Please try again.');
    }
  }

  /** Re-open the payment widget for an order that is still awaiting payment. */
  async retryPayment(userId: string, orderId: string): Promise<CheckoutResult> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { user: true, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw notFound('Order');
    if (order.status !== 'PENDING_PAYMENT' || order.paymentMethod !== 'RAZORPAY')
      throw badRequest('NOT_PAYABLE', 'This order is not awaiting payment');
    if (order.expiresAt && order.expiresAt < new Date())
      throw badRequest(
        'ORDER_EXPIRED',
        'The payment window for this order has closed. Please place the order again.',
      );

    const payment = order.payments[0];
    if (!payment) throw badRequest('NOT_PAYABLE', 'No payment found for this order');
    let providerOrderId = payment.providerOrderId;
    let amountPaise = toPaise(num(payment.amount));
    if (!providerOrderId) {
      const go = await this.gateway.createOrder({
        amountPaise,
        receipt: orderId,
        notes: { orderId, userId },
      });
      providerOrderId = go.id;
      amountPaise = go.amountPaise;
      await this.prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId } });
    }
    const shipping = order.shippingAddress as { phone?: string };
    return {
      order: await this.load(orderId),
      razorpay: {
        keyId: this.gateway.keyId,
        orderId: providerOrderId,
        amount: amountPaise,
        currency: 'INR',
        name: 'Glideinbir Kart',
        description: `Order ${order.orderNumber}`,
        prefill: {
          name: order.user.name,
          email: order.user.email ?? '',
          contact: order.user.phone ?? shipping.phone ?? '',
        },
        mock: this.gateway.mock,
      },
    };
  }

  private async load(orderId: string) {
    return toOrderDto(
      await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }),
    );
  }
}
