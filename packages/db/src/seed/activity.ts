import type { OrderStatus, PrismaClient, SubOrderStatus } from '@prisma/client';
import { computePricing, computeCouponDiscount, fromPaise, gstContained, toPaise } from '@gk/utils';
import type { SeededProduct, SeededVariant } from './products';
import { chance, daysAgo, pick, rand, rng } from './util';

interface Customer {
  id: string;
  name: string;
  addressId: string;
}
interface Ctx {
  demo: { id: string; name: string; homeAddressId: string; workAddressId: string };
  customers: Customer[];
  sellerIds: string[];
  sellerUserIds: string[];
  adminId: string;
  products: SeededProduct[];
  categoryIds: Map<string, string>;
}

const COURIERS = ['Delhivery', 'Blue Dart', 'Ecom Express', 'XpressBees', 'DTDC'];
const DELIVERY = { flatFee: 49, freeThreshold: 499 };

const COMMISSION = {
  seller: new Map<string, number>([['slr_2', 12.5]]),
  root: new Map<string, number>([
    ['electronics', 6],
    ['mens-fashion', 14],
    ['womens-fashion', 14],
    ['books-stationery', 9],
    ['beauty-personal-care', 12],
  ]),
  global: 10,
};
const commissionFor = (sellerId: string, path: string) =>
  COMMISSION.seller.get(sellerId) ??
  COMMISSION.root.get(path.split('/')[0] as string) ??
  COMMISSION.global;

const REVIEW_COPY: Record<number, Array<[string, string]>> = {
  5: [
    [
      'Absolutely worth it',
      'Quality is far better than I expected for the price. Packaging was neat and delivery was a day early.',
    ],
    [
      'Love it!',
      'Exactly as described. Have been using it for two weeks and zero complaints. Highly recommended.',
    ],
    [
      'Superb value for money',
      'Looks premium, feels sturdy and works flawlessly. Would buy again from this seller.',
    ],
    [
      'Five stars',
      'Great build quality and the finishing is excellent. Gifted one to my brother and he loved it too.',
    ],
  ],
  4: [
    [
      'Very good',
      'Does the job really well. Minor nitpick on the packaging but the product itself is great.',
    ],
    [
      'Good purchase',
      'Happy with the quality. Delivery took a little longer than the estimate but no complaints otherwise.',
    ],
    [
      'Solid choice',
      'Nice product at this price. A small improvement in the instructions would make it perfect.',
    ],
  ],
  3: [
    [
      'Decent, not amazing',
      'It is okay for the price. Expected slightly better finish, but it works fine.',
    ],
    ['Average', 'Does what it says. Nothing special, nothing terrible either.'],
  ],
  2: [
    [
      'Could be better',
      'Quality did not match the pictures. Had to adjust a few things to make it usable.',
    ],
    [
      'Disappointed',
      'Arrived with minor scratches. Seller support was helpful but the product feels cheap.',
    ],
  ],
  1: [
    [
      'Not as described',
      'The product I received was different from what was shown. Raising a return.',
    ],
  ],
};
const pickRating = () => {
  const r = rng();
  return r < 0.5 ? 5 : r < 0.78 ? 4 : r < 0.9 ? 3 : r < 0.96 ? 2 : 1;
};

export async function seedActivity(prisma: PrismaClient, ctx: Ctx) {
  const active = ctx.products.filter((p) => p.status === 'ACTIVE');
  const find = (part: string) => {
    const p = ctx.products.find((x) => x.name.includes(part));
    if (!p) throw new Error(`seed: product "${part}" not found`);
    return p;
  };
  const stock = new Map<string, number>(); // variantId → remaining
  active.forEach((p) => p.variants.forEach((v) => stock.set(v.id, v.stock)));

  let orderSeq = 0;
  const orderRows: Array<{
    id: string;
    userId: string;
    status: OrderStatus;
    subOrders: Array<{
      id: string;
      sellerId: string;
      status: SubOrderStatus;
      deliveredAt: Date | null;
      items: Array<{
        id: string;
        productId: string;
        variantId: string;
        qty: number;
        unitPrice: number;
        lineNet: number;
        name: string;
        image: string;
      }>;
    }>;
    createdAt: Date;
  }> = [];
  const couponUse = new Map<string, number>();

  interface OrderSpec {
    customer: { id: string; name: string; addressId: string };
    items: Array<{ variant: SeededVariant; qty: number }>;
    status: 'DELIVERED' | 'SHIPPED' | 'PROCESSING' | 'PLACED' | 'CANCELLED' | 'PAYMENT_FAILED';
    method: 'RAZORPAY' | 'COD';
    ago: number;
    coupon?: string;
    deliveredAgo?: number;
  }

  const ADDRESS_CACHE = new Map<
    string,
    {
      fullName: string;
      phone: string;
      line1: string;
      line2: string | null;
      landmark: string | null;
      city: string;
      state: string;
      pincode: string;
      country: string;
    }
  >();

  async function makeOrder(spec: OrderSpec) {
    const created = daysAgo(spec.ago, rand(0, 10));
    orderSeq += 1;
    const yy = String(created.getFullYear()).slice(2);
    const mm = String(created.getMonth() + 1).padStart(2, '0');
    const dd = String(created.getDate()).padStart(2, '0');
    const orderNumber = `GK${yy}${mm}${dd}${String(100000 + orderSeq * 7 + rand(0, 6))}`;

    let address = ADDRESS_CACHE.get(spec.customer.addressId);
    if (!address) {
      const a = await prisma.address.findUniqueOrThrow({ where: { id: spec.customer.addressId } });
      address = {
        fullName: a.fullName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        landmark: a.landmark,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        country: a.country,
      };
      ADDRESS_CACHE.set(spec.customer.addressId, address);
    }

    const lines = spec.items.map((it, i) => ({
      id: `${i}`,
      sellerId: it.variant.sellerId,
      mrp: it.variant.mrp,
      price: it.variant.price,
      quantity: it.qty,
      gstRate: it.variant.gstRate,
    }));
    const pre = computePricing(lines, { delivery: DELIVERY });
    let couponId: string | null = null;
    let couponDiscount = 0;
    if (spec.coupon) {
      const c = await prisma.coupon.findUnique({ where: { code: spec.coupon } });
      if (c && pre.subtotal >= Number(c.minOrderAmount)) {
        couponId = c.id;
        couponDiscount = computeCouponDiscount(
          {
            type: c.type,
            value: Number(c.value),
            minOrderAmount: Number(c.minOrderAmount),
            maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null,
          },
          pre.subtotal,
        );
      }
    }
    const pricing = computePricing(lines, { couponDiscount, delivery: DELIVERY });

    const cancelled = spec.status === 'CANCELLED';
    const failed = spec.status === 'PAYMENT_FAILED';
    const online = spec.method === 'RAZORPAY';
    const paid = online && !failed;
    const placedAt = new Date(created.getTime() + 60_000);
    const orderStatus: OrderStatus = failed
      ? 'PAYMENT_FAILED'
      : cancelled
        ? 'CANCELLED'
        : spec.status;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: spec.customer.id,
        status: orderStatus,
        paymentMethod: spec.method,
        shippingAddress: address,
        couponId,
        couponCode: couponId ? spec.coupon : null,
        mrpTotal: pricing.mrpTotal,
        productDiscount: pricing.productDiscount,
        subtotal: pricing.subtotal,
        couponDiscount: pricing.couponDiscount,
        deliveryFee: pricing.deliveryFee,
        gstTotal: pricing.gstTotal,
        total: pricing.total,
        placedAt: failed ? null : placedAt,
        cancelledAt: cancelled || failed ? new Date(created.getTime() + 3_600_000) : null,
        cancelReason: cancelled ? 'Ordered by mistake' : failed ? 'Payment window expired' : null,
        invoiceNumber: failed
          ? null
          : `GK/${yy}-${String(Number(yy) + 1).padStart(2, '0')}/${orderNumber.slice(2)}`,
        createdAt: created,
      },
    });
    if (couponId) {
      await prisma.couponUsage.create({
        data: { couponId, userId: spec.customer.id, orderId: order.id, discount: couponDiscount },
      });
      couponUse.set(couponId, (couponUse.get(couponId) ?? 0) + 1);
    }

    const history: Array<{
      orderId: string;
      subOrderId?: string;
      status: string;
      note?: string;
      createdAt: Date;
    }> = [
      {
        orderId: order.id,
        status: 'PENDING_PAYMENT',
        note: online ? 'Awaiting payment' : 'Order received',
        createdAt: created,
      },
    ];
    if (!failed)
      history.push({
        orderId: order.id,
        status: 'PLACED',
        note: online ? 'Payment received' : 'Order placed — Cash on Delivery',
        createdAt: placedAt,
      });
    else
      history.push({
        orderId: order.id,
        status: 'PAYMENT_FAILED',
        note: 'Payment not completed in time',
        createdAt: new Date(created.getTime() + 900_000),
      });

    // sub-orders per seller
    const bySeller = new Map<string, number[]>();
    spec.items.forEach((it, i) =>
      bySeller.set(it.variant.sellerId, [...(bySeller.get(it.variant.sellerId) ?? []), i]),
    );
    const subs: (typeof orderRows)[number]['subOrders'] = [];
    let n = 1;
    let sellerIdx = 0;
    for (const [sellerId, idxs] of bySeller) {
      let gross = 0;
      let disc = 0;
      let gst = 0;
      let comm = 0;
      const itemsData = idxs.map((i) => {
        const it = spec.items[i]!;
        const pl = pricing.lines[i]!;
        gross += toPaise(pl.lineTotal);
        disc += toPaise(pl.discount);
        gst += toPaise(pl.gstAmount);
        const taxable =
          toPaise(pl.lineTotal) - gstContained(toPaise(pl.lineTotal), it.variant.gstRate);
        comm += Math.round((taxable * commissionFor(sellerId, it.variant.categoryPath)) / 100);
        return { it, pl };
      });

      // sub-order state & timeline
      let subStatus: SubOrderStatus;
      let times: {
        acceptedAt?: Date;
        packedAt?: Date;
        shippedAt?: Date;
        deliveredAt?: Date;
        cancelledAt?: Date;
      } = {};
      const t = (hours: number) => new Date(placedAt.getTime() + hours * 3_600_000);
      switch (spec.status) {
        case 'DELIVERED':
          subStatus = 'DELIVERED';
          times = {
            acceptedAt: t(2),
            packedAt: t(8),
            shippedAt: t(26),
            deliveredAt:
              spec.deliveredAgo !== undefined
                ? daysAgo(spec.deliveredAgo, rand(0, 6))
                : new Date(placedAt.getTime() + rand(3, 6) * 86_400_000),
          };
          break;
        case 'SHIPPED':
          subStatus = sellerIdx === 1 ? 'PACKED' : 'SHIPPED';
          times =
            sellerIdx === 1
              ? { acceptedAt: t(3), packedAt: t(10) }
              : { acceptedAt: t(3), packedAt: t(9), shippedAt: t(30) };
          break;
        case 'PROCESSING':
          subStatus = sellerIdx === 1 ? 'PENDING' : 'ACCEPTED';
          times = sellerIdx === 1 ? {} : { acceptedAt: t(4) };
          break;
        case 'CANCELLED':
        case 'PAYMENT_FAILED':
          subStatus = 'CANCELLED';
          times = { cancelledAt: t(1) };
          break;
        default:
          subStatus = 'PENDING';
      }
      const courier = pick(COURIERS);
      const trackingId = `${courier.slice(0, 2).toUpperCase()}${rand(10000000, 99999999)}`;
      const sub = await prisma.subOrder.create({
        data: {
          orderId: order.id,
          sellerId,
          subOrderNumber: `${orderNumber}-${n++}`,
          status: subStatus,
          subtotal: fromPaise(gross),
          discount: fromPaise(disc),
          gstTotal: fromPaise(gst),
          total: fromPaise(gross - disc),
          commissionRate: gross > 0 ? Math.round((comm / (gross - gst)) * 10000) / 100 : 0,
          commissionAmount: fromPaise(comm),
          sellerEarning: fromPaise(gross - comm),
          courier: times.shippedAt ? courier : null,
          trackingId: times.shippedAt ? trackingId : null,
          trackingUrl: times.shippedAt ? `https://track.example.com/${trackingId}` : null,
          cancelReason: subStatus === 'CANCELLED' ? 'Cancelled' : null,
          ...times,
          createdAt: created,
        },
      });
      const sellerHistory: Array<[SubOrderStatus, Date | undefined, string]> = [
        ['ACCEPTED', times.acceptedAt, 'Seller accepted the order'],
        ['PACKED', times.packedAt, 'Order packed'],
        ['SHIPPED', times.shippedAt, `Handed to ${courier} · ${trackingId}`],
        ['DELIVERED', times.deliveredAt, 'Delivered to customer'],
      ];
      for (const [s, at, note] of sellerHistory)
        if (at)
          history.push({ orderId: order.id, subOrderId: sub.id, status: s, note, createdAt: at });

      const created_items: (typeof subs)[number]['items'] = [];
      for (const { it, pl } of itemsData) {
        const row = await prisma.orderItem.create({
          data: {
            orderId: order.id,
            subOrderId: sub.id,
            sellerId,
            productId: it.variant.productId,
            variantId: it.variant.id,
            name: it.variant.productName,
            variantName: it.variant.name,
            sku: it.variant.sku,
            slug: it.variant.productSlug,
            image: it.variant.image,
            quantity: it.qty,
            mrp: it.variant.mrp,
            unitPrice: it.variant.price,
            discount: pl.discount,
            gstRate: it.variant.gstRate,
            gstAmount: pl.gstAmount,
            lineTotal: pl.lineTotal,
          },
        });
        created_items.push({
          id: row.id,
          productId: it.variant.productId,
          variantId: it.variant.id,
          qty: it.qty,
          unitPrice: it.variant.price,
          lineNet: pl.net,
          name: it.variant.productName,
          image: it.variant.image,
        });
        if (!cancelled && !failed)
          stock.set(it.variant.id, Math.max((stock.get(it.variant.id) ?? 0) - it.qty, 0));
      }
      subs.push({
        id: sub.id,
        sellerId,
        status: subStatus,
        deliveredAt: times.deliveredAt ?? null,
        items: created_items,
      });
      sellerIdx += 1;
    }

    // payment
    const refundedOnline = cancelled && online;
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: spec.method,
        status: failed
          ? 'FAILED'
          : refundedOnline
            ? 'REFUNDED'
            : spec.method === 'COD'
              ? spec.status === 'DELIVERED'
                ? 'PAID'
                : 'PENDING'
              : 'PAID',
        amount: pricing.total,
        provider: online ? 'razorpay' : 'cod',
        providerOrderId: online ? `order_demo_${orderNumber}` : null,
        providerPaymentId: paid ? `pay_demo_${orderNumber}` : null,
        failureReason: failed ? 'Payment window expired' : null,
        paidAt: paid
          ? placedAt
          : spec.method === 'COD' && spec.status === 'DELIVERED'
            ? (subs[0]?.deliveredAt ?? placedAt)
            : null,
        createdAt: created,
      },
    });
    if (refundedOnline) {
      await prisma.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amount: pricing.total,
          status: 'PROCESSED',
          reason: 'Ordered by mistake',
          providerRefundId: `rfnd_demo_${orderNumber}`,
          processedAt: new Date(created.getTime() + 7_200_000),
          notes: 'Order cancelled',
        },
      });
    }
    if (cancelled)
      history.push({
        orderId: order.id,
        status: 'CANCELLED',
        note: 'Customer: Ordered by mistake',
        createdAt: new Date(created.getTime() + 3_600_000),
      });
    if (spec.status === 'SHIPPED')
      history.push({
        orderId: order.id,
        status: 'SHIPPED',
        createdAt: subs.find((s) => s.status === 'SHIPPED')
          ? new Date(placedAt.getTime() + 30 * 3_600_000)
          : placedAt,
      });
    if (spec.status === 'PROCESSING')
      history.push({
        orderId: order.id,
        status: 'PROCESSING',
        createdAt: new Date(placedAt.getTime() + 4 * 3_600_000),
      });
    if (spec.status === 'DELIVERED')
      history.push({
        orderId: order.id,
        status: 'DELIVERED',
        createdAt: subs[0]?.deliveredAt ?? placedAt,
      });
    await prisma.orderStatusHistory.createMany({ data: history });
    orderRows.push({
      id: order.id,
      userId: spec.customer.id,
      status: orderStatus,
      subOrders: subs,
      createdAt: created,
    });
    return order;
  }

  // ───────────────── hand-picked orders for the demo customer ─────────────────
  const demo = { id: ctx.demo.id, name: ctx.demo.name, addressId: ctx.demo.homeAddressId };
  const v0 = (p: SeededProduct, i = 0) => p.variants[i] as SeededVariant;
  await makeOrder({
    customer: demo,
    ago: 34,
    status: 'DELIVERED',
    method: 'RAZORPAY',
    coupon: 'WELCOME10',
    items: [
      { variant: v0(find('Zenith Aura ANC')), qty: 1 },
      { variant: v0(find('Classic Crew Neck')), qty: 2 },
    ],
  });
  await makeOrder({
    customer: demo,
    ago: 21,
    status: 'DELIVERED',
    method: 'COD',
    items: [{ variant: v0(find('Cloudrunner')), qty: 1 }],
  });
  await makeOrder({
    customer: demo,
    ago: 9,
    status: 'DELIVERED',
    deliveredAgo: 2,
    method: 'RAZORPAY',
    items: [
      { variant: v0(find('Orbit Pulse Active')), qty: 1 },
      { variant: v0(find('Aloe Vera Gel')), qty: 2 },
      { variant: v0(find('Yoga Mat')), qty: 1 },
    ],
  });
  await makeOrder({
    customer: demo,
    ago: 4,
    status: 'SHIPPED',
    method: 'RAZORPAY',
    items: [
      { variant: v0(find('Nova X12'), 1), qty: 1 },
      { variant: v0(find('ShockGuard')), qty: 1 },
    ],
  });
  await makeOrder({
    customer: demo,
    ago: 1,
    status: 'PROCESSING',
    method: 'COD',
    items: [
      { variant: v0(find('Classic Crew Neck')), qty: 1 },
      { variant: v0(find('Hardbound Dotted Journal')), qty: 2 },
    ],
  });
  await makeOrder({
    customer: demo,
    ago: 12,
    status: 'CANCELLED',
    method: 'RAZORPAY',
    items: [{ variant: v0(find('Nordic 3-Seater')), qty: 1 }],
  });
  await makeOrder({
    customer: demo,
    ago: 0,
    status: 'PLACED',
    method: 'RAZORPAY',
    coupon: 'FLAT100',
    items: [
      { variant: v0(find('Monsoon Archive')), qty: 1 },
      { variant: v0(find('Calm Compass')), qty: 1 },
      { variant: v0(find('Wooden Building Blocks')), qty: 1 },
    ],
  });

  // ───────────────── ~85 random orders from other customers over the last 75 days ─────────────────
  const statusPool: OrderSpec['status'][] = [
    ...Array<OrderSpec['status']>(54).fill('DELIVERED'),
    ...Array<OrderSpec['status']>(9).fill('SHIPPED'),
    ...Array<OrderSpec['status']>(7).fill('PROCESSING'),
    ...Array<OrderSpec['status']>(6).fill('PLACED'),
    ...Array<OrderSpec['status']>(7).fill('CANCELLED'),
    'PAYMENT_FAILED',
    'PAYMENT_FAILED',
  ];
  for (const st of statusPool) {
    const customer = pick(ctx.customers);
    const count = chance(0.5) ? 1 : chance(0.7) ? 2 : 3;
    const items: Array<{ variant: SeededVariant; qty: number }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      const p = pick(active);
      if (seen.has(p.id)) continue;
      const v = pick(p.variants);
      if ((stock.get(v.id) ?? 0) < 4) continue;
      seen.add(p.id);
      items.push({ variant: v, qty: p.variants[0]!.price > 5000 ? 1 : rand(1, 2) });
    }
    if (items.length === 0) continue;
    const maxAge =
      st === 'DELIVERED' ? 75 : st === 'CANCELLED' ? 40 : st === 'PAYMENT_FAILED' ? 14 : 8;
    const ago = rand(st === 'DELIVERED' ? 4 : 0, maxAge);
    await makeOrder({
      customer,
      items,
      status: st,
      ago,
      method: chance(0.62) ? 'RAZORPAY' : 'COD',
      coupon: chance(0.15) ? pick(['WELCOME10', 'FLAT100', 'FREESHIP']) : undefined,
    });
  }

  // ── persist inventory & counters ──
  for (const [variantId, remaining] of stock) {
    await prisma.inventory.update({ where: { variantId }, data: { quantity: remaining } });
  }
  for (const [couponId, n] of couponUse)
    await prisma.coupon.update({ where: { id: couponId }, data: { usedCount: n } });
  await prisma.$executeRaw`
    UPDATE "Product" p SET "totalStock" = COALESCE((SELECT SUM(GREATEST(i.quantity - i.reserved, 0)) FROM "ProductVariant" v JOIN "Inventory" i ON i."variantId" = v.id WHERE v."productId" = p.id AND v."isActive" AND v."deletedAt" IS NULL), 0)`;
  await prisma.$executeRaw`
    UPDATE "Product" p SET "soldCount" = p."soldCount" + COALESCE((SELECT SUM(oi.quantity) FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" WHERE oi."productId" = p.id AND o.status IN ('PLACED','PROCESSING','SHIPPED','DELIVERED')), 0)`;

  // ───────────────── reviews on delivered items ─────────────────
  const reviewed = new Set<string>();
  const reviewRows: Array<{ id: string; productId: string; rating: number; sellerId: string }> = [];
  for (const o of orderRows.filter((r) => r.status === 'DELIVERED')) {
    for (const so of o.subOrders) {
      for (const it of so.items) {
        const key = `${o.userId}:${it.productId}`;
        if (reviewed.has(key) || !chance(0.6)) continue;
        reviewed.add(key);
        const rating = pickRating();
        const [title, body] = pick(REVIEW_COPY[rating]!);
        const createdAt = new Date(
          (so.deliveredAt ?? o.createdAt).getTime() + rand(1, 5) * 86_400_000,
        );
        const r = await prisma.review.create({
          data: {
            productId: it.productId,
            userId: o.userId,
            orderItemId: it.id,
            rating,
            title,
            body,
            isVerifiedPurchase: true,
            helpfulCount: rating >= 4 ? rand(0, 24) : rand(0, 6),
            sellerReply: chance(rating <= 3 ? 0.8 : 0.15)
              ? rating <= 3
                ? 'Sorry to hear this — please reach out to our support with your order number and we will make it right.'
                : 'Thank you for the kind words! Happy shopping.'
              : null,
            sellerRepliedAt: null,
            createdAt,
            images: chance(0.14) ? { create: [{ url: it.image }] } : undefined,
          },
        });
        if (r.sellerReply)
          await prisma.review.update({
            where: { id: r.id },
            data: { sellerRepliedAt: new Date(createdAt.getTime() + 86_400_000) },
          });
        reviewRows.push({ id: r.id, productId: it.productId, rating, sellerId: so.sellerId });
      }
    }
  }
  await prisma.$executeRaw`
    UPDATE "Product" p SET "ratingAvg" = s.avg, "ratingCount" = s.cnt
    FROM (SELECT "productId", ROUND(AVG(rating)::numeric, 2) AS avg, COUNT(*)::int AS cnt FROM "Review" WHERE status = 'VISIBLE' AND "deletedAt" IS NULL GROUP BY "productId") s
    WHERE s."productId" = p.id`;
  await prisma.$executeRaw`
    UPDATE "SellerProfile" sp SET "ratingAvg" = s.avg, "ratingCount" = s.cnt
    FROM (SELECT p."sellerId", ROUND(AVG(r.rating)::numeric, 2) AS avg, COUNT(*)::int AS cnt FROM "Review" r JOIN "Product" p ON p.id = r."productId" WHERE r.status = 'VISIBLE' AND r."deletedAt" IS NULL GROUP BY p."sellerId") s
    WHERE s."sellerId" = sp.id`;

  // ───────────────── Q&A ─────────────────
  const qa: Array<[string, string, string?, boolean?]> = [
    [
      'Nova X12',
      'Does this support dual SIM with an SD card at the same time?',
      'Yes — it has a dedicated microSD slot alongside two nano-SIM slots.',
      true,
    ],
    [
      'Nova X12',
      'Is the charger included in the box?',
      'Yes, a 67 W charger and USB-C cable are included.',
      true,
    ],
    [
      'Orbit Book Air',
      'Can the RAM be upgraded later?',
      'The RAM is soldered, so please choose the configuration you need at purchase.',
      true,
    ],
    [
      'Aura ANC',
      'How is the noise cancellation on flights?',
      'I used it on a 3-hour flight — engine drone is almost gone. Very good.',
      false,
    ],
    [
      'Kanjivaram',
      'Is the blouse piece stitched?',
      'It is an unstitched blouse piece of about 0.8 m, matching the saree.',
      true,
    ],
    [
      'Yoga Mat',
      'Is it suitable for hot yoga?',
      'Yes, the dual-texture surface stays grippy even when sweaty.',
      true,
    ],
    [
      'Nordic 3-Seater',
      'Do you provide installation?',
      'Yes — free installation within 3 days of delivery in metro cities.',
      true,
    ],
    ['Turbo Mixer', 'Does it come with a warranty card?', undefined],
    [
      'Cloudrunner',
      'Do these run true to size?',
      'Fit true to size for me (UK 9). Go half-size up if you wear thick socks.',
      false,
    ],
    ['Vitamin C', 'Can I use it with retinol?', undefined],
  ];
  for (const [part, question, answer, bySeller] of qa) {
    const p = find(part);
    const asker = pick(ctx.customers);
    const q = await prisma.question.create({
      data: { productId: p.id, userId: asker.id, body: question, createdAt: daysAgo(rand(2, 30)) },
    });
    if (answer) {
      const sellerIdx = ctx.sellerIds.indexOf(p.sellerId);
      await prisma.answer.create({
        data: {
          questionId: q.id,
          userId: bySeller ? (ctx.sellerUserIds[sellerIdx] as string) : pick(ctx.customers).id,
          body: answer,
          isSeller: Boolean(bySeller),
          createdAt: daysAgo(rand(0, 2)),
        },
      });
    }
  }

  // ───────────────── returns & disputes ─────────────────
  const deliveredItems = orderRows
    .filter((o) => o.status === 'DELIVERED')
    .flatMap((o) =>
      o.subOrders
        .filter((s) => s.deliveredAt && Date.now() - s.deliveredAt.getTime() < 6 * 86_400_000)
        .flatMap((s) => s.items.map((i) => ({ o, s, i }))),
    );
  const demoRecent = deliveredItems.filter((d) => d.o.userId === ctx.demo.id);
  const others = deliveredItems.filter((d) => d.o.userId !== ctx.demo.id);
  const pickReturn = (list: typeof deliveredItems, n: number) => list.slice(n, n + 1)[0];

  const r1 = pickReturn(others, 0);
  if (r1)
    await prisma.returnRequest.create({
      data: {
        orderItemId: r1.i.id,
        subOrderId: r1.s.id,
        userId: r1.o.userId,
        quantity: 1,
        reason: 'Product damaged or defective',
        description: 'The item arrived with a crack on one side.',
        images: [r1.i.image],
        status: 'REQUESTED',
      },
    });
  const r2 = pickReturn(others, 1);
  if (r2)
    await prisma.returnRequest.create({
      data: {
        orderItemId: r2.i.id,
        subOrderId: r2.s.id,
        userId: r2.o.userId,
        quantity: 1,
        reason: 'Size or fit issue',
        description: 'Too tight, need a size up.',
        status: 'APPROVED',
        sellerRemarks: 'Approved. Pickup scheduled.',
      },
    });
  const r3 = pickReturn(others, 2);
  if (r3)
    await prisma.returnRequest.create({
      data: {
        orderItemId: r3.i.id,
        subOrderId: r3.s.id,
        userId: r3.o.userId,
        quantity: 1,
        reason: 'Item not as described',
        description: 'Colour is quite different from the photos.',
        status: 'REJECTED',
        sellerRemarks:
          'Colour variation is within normal screen difference; item unused? Cannot accept.',
      },
    });
  const r4 = pickReturn(others, 3);
  if (r4) {
    await prisma.returnRequest.create({
      data: {
        orderItemId: r4.i.id,
        subOrderId: r4.s.id,
        userId: r4.o.userId,
        quantity: 1,
        reason: 'Wrong item received',
        description: 'I received a different variant than ordered. Seller rejected the return.',
        status: 'ESCALATED',
        sellerRemarks: 'Item matches the order.',
      },
    });
  }
  const r5 = pickReturn(demoRecent, 1);
  if (r5) {
    const payment = await prisma.payment.findFirst({ where: { orderId: r5.o.id } });
    const amount = r5.i.lineNet;
    const rr = await prisma.returnRequest.create({
      data: {
        orderItemId: r5.i.id,
        subOrderId: r5.s.id,
        userId: r5.o.userId,
        quantity: 1,
        reason: 'Changed my mind',
        status: 'REFUNDED',
        refundAmount: amount,
        sellerRemarks: 'Received in good condition.',
        adminRemarks: 'Refund processed.',
      },
    });
    await prisma.refund.create({
      data: {
        orderId: r5.o.id,
        paymentId: payment?.id,
        returnRequestId: rr.id,
        amount,
        status: 'PROCESSED',
        reason: 'Return: Changed my mind',
        providerRefundId: 'rfnd_demo_return',
        processedAt: new Date(),
      },
    });
    await prisma.orderItem.update({ where: { id: r5.i.id }, data: { returnedQty: 1 } });
  }

  // ───────────────── payouts ─────────────────
  // sub-orders delivered > 7 days ago are payable; settle the oldest batch for seller 1.
  const oldDelivered = await prisma.subOrder.findMany({
    where: { status: 'DELIVERED', deliveredAt: { lte: daysAgo(30) }, sellerId: ctx.sellerIds[0] },
  });
  if (oldDelivered.length) {
    const gross = oldDelivered.reduce((n, s) => n + toPaise(Number(s.subtotal)), 0);
    const commission = oldDelivered.reduce((n, s) => n + toPaise(Number(s.commissionAmount)), 0);
    const net = oldDelivered.reduce((n, s) => n + toPaise(Number(s.sellerEarning)), 0);
    const payout = await prisma.payout.create({
      data: {
        sellerId: ctx.sellerIds[0] as string,
        periodStart: oldDelivered.reduce(
          (m, s) => (s.deliveredAt && s.deliveredAt < m ? s.deliveredAt : m),
          new Date(),
        ),
        periodEnd: daysAgo(30),
        grossAmount: fromPaise(gross),
        commissionAmount: fromPaise(commission),
        netAmount: fromPaise(net),
        status: 'SETTLED',
        reference: 'UTR2026052100012345',
        settledAt: daysAgo(22),
        notes: 'Monthly settlement',
      },
    });
    await prisma.subOrder.updateMany({
      where: { id: { in: oldDelivered.map((s) => s.id) } },
      data: { payoutId: payout.id },
    });
  }

  // ───────────────── wishlist, recently viewed, cart, notifications ─────────────────
  const wish = [
    'Zenith Aura ANC',
    'Kanjivaram',
    'Nordic 3-Seater',
    'Orbit Book Air',
    'Oud Noir',
  ].map(find);
  await prisma.wishlistItem.createMany({
    data: wish.map((p, i) => ({ userId: ctx.demo.id, productId: p.id, createdAt: daysAgo(i + 1) })),
  });
  const viewed = [
    'Nova Pro 14',
    'Orbit Vision',
    'Trail Grip',
    'Boom 360',
    'Oxford Button-Down',
    'Floral Midi',
    'Kashmir Willow',
    'Keratin',
  ].map(find);
  await prisma.recentlyViewed.createMany({
    data: viewed.map((p, i) => ({
      userId: ctx.demo.id,
      productId: p.id,
      viewedAt: new Date(Date.now() - i * 3_600_000 * 5),
    })),
  });
  const cart = await prisma.cart.create({ data: { userId: ctx.demo.id } });
  const cartVariants = [v0(find('Beat Buds')), v0(find('Jasmine Body Mist'))];
  await prisma.cartItem.createMany({
    data: cartVariants.map((v, i) => ({ cartId: cart.id, variantId: v.id, quantity: i + 1 })),
  });

  const note = (
    userId: string,
    type: 'ORDER' | 'PAYMENT' | 'PROMO' | 'SYSTEM' | 'PRODUCT' | 'SELLER',
    title: string,
    body: string,
    ago: number,
    read = false,
  ) => ({
    userId,
    type,
    title,
    body,
    createdAt: daysAgo(ago),
    readAt: read ? daysAgo(ago - 0.1 > 0 ? ago - 0.1 : 0) : null,
  });
  await prisma.notification.createMany({
    data: [
      note(
        ctx.demo.id,
        'ORDER',
        'Your order has shipped',
        'Your Nova X12 order is on its way. Track it from your orders page.',
        3,
      ),
      note(
        ctx.demo.id,
        'ORDER',
        'Order delivered',
        'Your Orbit Pulse Active order was delivered. Leave a review!',
        2,
      ),
      note(
        ctx.demo.id,
        'PAYMENT',
        'Refund initiated',
        'A refund for your recent return is being processed.',
        1,
      ),
      note(
        ctx.demo.id,
        'PROMO',
        'FESTIVE20 is live',
        'Get 20% off up to ₹500 on orders above ₹1,999.',
        1,
        true,
      ),
      note(
        ctx.demo.id,
        'SYSTEM',
        'Welcome to Glideinbir Kart',
        'Enjoy free delivery on orders above ₹499.',
        30,
        true,
      ),
      ...ctx.sellerUserIds.flatMap((uid) => [
        note(
          uid,
          'ORDER',
          'New order received',
          'You have a new order — accept it to start fulfilment.',
          0,
        ),
        note(uid, 'PRODUCT', 'Low stock alert', 'One of your SKUs is running low on stock.', 1),
        note(
          uid,
          'PAYMENT',
          'Payout settled',
          'A payout was transferred to your bank account.',
          22,
          true,
        ),
      ]),
      note(
        ctx.adminId,
        'SELLER',
        'New seller application',
        'Spice Route Organics submitted their KYC for review.',
        1,
      ),
      note(
        ctx.adminId,
        'PRODUCT',
        'Products awaiting moderation',
        '2 products are waiting for review.',
        0,
      ),
    ],
  });

  // ───────────────── audit trail samples ─────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: ctx.adminId,
        actorRole: 'ADMIN',
        action: 'seller.approve',
        entityType: 'SellerProfile',
        entityId: 'slr_1',
        metadata: { remarks: 'KYC verified' },
        createdAt: daysAgo(145),
      },
      {
        actorId: ctx.adminId,
        actorRole: 'ADMIN',
        action: 'seller.approve',
        entityType: 'SellerProfile',
        entityId: 'slr_2',
        metadata: { remarks: 'KYC verified' },
        createdAt: daysAgo(144),
      },
      {
        actorId: ctx.adminId,
        actorRole: 'ADMIN',
        action: 'seller.approve',
        entityType: 'SellerProfile',
        entityId: 'slr_3',
        metadata: { remarks: 'KYC verified' },
        createdAt: daysAgo(143),
      },
      {
        actorId: ctx.adminId,
        actorRole: 'ADMIN',
        action: 'commission.save',
        entityType: 'CommissionRule',
        metadata: { scope: 'GLOBAL', rate: 10 },
        createdAt: daysAgo(140),
      },
      {
        actorId: ctx.adminId,
        actorRole: 'ADMIN',
        action: 'coupon.create',
        entityType: 'Coupon',
        metadata: { code: 'WELCOME10' },
        createdAt: daysAgo(100),
      },
      {
        actorId: ctx.sellerUserIds[0],
        actorRole: 'SELLER',
        action: 'product.create',
        entityType: 'Product',
        entityId: 'prd_001',
        metadata: { name: 'Nova X12 5G Smartphone' },
        createdAt: daysAgo(120),
      },
      {
        actorId: ctx.adminId,
        actorRole: 'ADMIN',
        action: 'payout.settle',
        entityType: 'Payout',
        metadata: { reference: 'UTR2026052100012345' },
        createdAt: daysAgo(22),
      },
    ],
  });

  return { orders: orderRows.length, reviews: reviewRows.length };
}
