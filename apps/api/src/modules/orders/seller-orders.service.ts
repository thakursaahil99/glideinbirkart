import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { SellerSubOrderDetail, SellerSubOrderRow, SubOrderStatus } from '@gk/types';
import type { SellerOrderQuery, ShipSubOrderInput } from '@gk/validators';
import { badRequest, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { orderByFrom } from '../../common/utils/sort';
import { PrismaService } from '../../infra/prisma.service';
import { num } from '../products/products.mapper';
import { OrderLifecycleService } from './order-lifecycle.service';
import { orderInclude, toHistory, toOrderDto } from './orders.mapper';

/** Orders whose payment is still pending/failed are invisible to sellers. */
const FULFILLABLE: Prisma.OrderWhereInput = {
  status: { notIn: ['PENDING_PAYMENT', 'PAYMENT_FAILED'] },
};

const rowInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      paymentMethod: true,
      shippingAddress: true,
      createdAt: true,
      user: { select: { name: true } },
      payments: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
    },
  },
  items: { select: { quantity: true } },
} satisfies Prisma.SubOrderInclude;

type Row = Prisma.SubOrderGetPayload<{ include: typeof rowInclude }>;

const toRow = (s: Row): SellerSubOrderRow => {
  const ship = s.order.shippingAddress as { city?: string };
  return {
    id: s.id,
    subOrderNumber: s.subOrderNumber,
    orderId: s.order.id,
    orderNumber: s.order.orderNumber,
    status: s.status,
    customerName: s.order.user.name,
    city: ship.city ?? '',
    paymentMethod: s.order.paymentMethod,
    paymentStatus: s.order.payments[0]?.status ?? 'PENDING',
    itemCount: s.items.reduce((n, i) => n + i.quantity, 0),
    total: num(s.total),
    sellerEarning: num(s.sellerEarning),
    createdAt: s.createdAt.toISOString(),
  };
};

const NEXT: Record<
  string,
  {
    from: SubOrderStatus[];
    to: SubOrderStatus;
    field: 'acceptedAt' | 'packedAt' | 'shippedAt' | 'deliveredAt';
    note: string;
  }
> = {
  accept: {
    from: ['PENDING'],
    to: 'ACCEPTED',
    field: 'acceptedAt',
    note: 'Seller accepted the order',
  },
  pack: { from: ['ACCEPTED'], to: 'PACKED', field: 'packedAt', note: 'Order packed' },
  ship: { from: ['PACKED'], to: 'SHIPPED', field: 'shippedAt', note: 'Handed to courier' },
  deliver: {
    from: ['SHIPPED'],
    to: 'DELIVERED',
    field: 'deliveredAt',
    note: 'Delivered to customer',
  },
};

@Injectable()
export class SellerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async list(sellerId: string, q: SellerOrderQuery): Promise<PagedResult<SellerSubOrderRow>> {
    const where: Prisma.SubOrderWhereInput = {
      sellerId,
      order: FULFILLABLE,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { subOrderNumber: { contains: q.q, mode: 'insensitive' } },
              { trackingId: { contains: q.q, mode: 'insensitive' } },
              { order: { user: { name: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.subOrder.findMany({
        where,
        orderBy: orderByFrom(
          q.sort,
          q.order,
          { createdAt: 'createdAt', total: 'total', subOrderNumber: 'subOrderNumber' },
          { createdAt: 'desc' as const },
        ) as Prisma.SubOrderOrderByWithRelationInput,
        include: rowInclude,
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.subOrder.count({ where }),
      this.prisma.subOrder.groupBy({
        by: ['status'],
        where: { sellerId, order: FULFILLABLE },
        _count: true,
      }),
    ]);
    return paged(rows.map(toRow), q.page, q.limit, total, {
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    });
  }

  async detail(sellerId: string, id: string): Promise<SellerSubOrderDetail> {
    const s = await this.prisma.subOrder.findFirst({
      where: { id, sellerId, order: FULFILLABLE },
      include: { ...rowInclude, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!s) throw notFound('Order');
    // reuse the customer order mapper for item-level detail (return state etc.)
    const full = await this.prisma.order.findUniqueOrThrow({
      where: { id: s.orderId },
      include: orderInclude,
    });
    const dto = toOrderDto(full).subOrders.find((x) => x.id === id);
    return {
      ...toRow(s),
      items: dto?.items ?? [],
      shippingAddress: toOrderDto(full).shippingAddress,
      courier: s.courier,
      trackingId: s.trackingId,
      trackingUrl: s.trackingUrl,
      commissionRate: num(s.commissionRate),
      commissionAmount: num(s.commissionAmount),
      timeline: s.statusHistory.map(toHistory),
    };
  }

  private async transition(
    sellerId: string,
    id: string,
    action: keyof typeof NEXT,
    actorId: string,
    extra: Prisma.SubOrderUpdateInput = {},
  ): Promise<SellerSubOrderDetail> {
    const rule = NEXT[action] as (typeof NEXT)[string];
    let orderId = '';
    let orderStatus = '';
    await this.prisma.$transaction(async (tx) => {
      const so = await tx.subOrder.findFirst({ where: { id, sellerId, order: FULFILLABLE } });
      if (!so) throw notFound('Order');
      if (!rule.from.includes(so.status))
        throw badRequest(
          'INVALID_TRANSITION',
          `Cannot ${action} an order that is ${so.status.toLowerCase()}`,
        );
      orderId = so.orderId;
      await tx.subOrder.update({
        where: { id },
        data: { status: rule.to, [rule.field]: new Date(), ...extra },
      });
      await this.lifecycle.history(tx, {
        orderId,
        subOrderId: id,
        status: rule.to,
        note: rule.note,
        actorId,
      });
      orderStatus = await this.lifecycle.recomputeStatus(tx, orderId, actorId);
    });
    if (
      ['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(orderStatus) &&
      ['ship', 'deliver', 'accept'].includes(action)
    ) {
      // one customer message per meaningful change: first acceptance, shipment and delivery
      if (action !== 'accept' || orderStatus === 'PROCESSING')
        await this.lifecycle.notifyStatus(
          orderId,
          orderStatus as 'PROCESSING' | 'SHIPPED' | 'DELIVERED',
        );
    }
    return this.detail(sellerId, id);
  }

  accept(sellerId: string, id: string, actorId: string) {
    return this.transition(sellerId, id, 'accept', actorId);
  }

  pack(sellerId: string, id: string, actorId: string) {
    return this.transition(sellerId, id, 'pack', actorId);
  }

  ship(sellerId: string, id: string, actorId: string, input: ShipSubOrderInput) {
    return this.transition(sellerId, id, 'ship', actorId, {
      courier: input.courier,
      trackingId: input.trackingId,
      trackingUrl: input.trackingUrl || null,
    });
  }

  deliver(sellerId: string, id: string, actorId: string) {
    return this.transition(sellerId, id, 'deliver', actorId);
  }

  async cancel(
    sellerId: string,
    id: string,
    actorId: string,
    reason: string,
  ): Promise<SellerSubOrderDetail> {
    const so = await this.prisma.subOrder.findFirst({
      where: { id, sellerId, order: FULFILLABLE },
      select: { id: true },
    });
    if (!so) throw notFound('Order');
    await this.lifecycle.cancelSubOrder(id, { reason, actorId, actorLabel: 'Seller' });
    return this.detail(sellerId, id);
  }
}
