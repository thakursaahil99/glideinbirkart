import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { OrderDto, OrderSummaryDto } from '@gk/types';
import type { CancelOrderInput, OrderListQuery } from '@gk/validators';
import { forbidden, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { canCancel, orderInclude, toOrderDto, toOrderSummary } from './orders.mapper';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async list(userId: string, q: OrderListQuery): Promise<PagedResult<OrderSummaryDto>> {
    const where: Prisma.OrderWhereInput = {
      userId,
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          items: { select: { name: true, image: true, quantity: true }, take: 6 },
        },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.order.count({ where }),
    ]);
    return paged(rows.map(toOrderSummary), q.page, q.limit, total);
  }

  async get(userId: string, orderId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, deletedAt: null },
      include: orderInclude,
    });
    if (!order) throw notFound('Order');
    return toOrderDto(order);
  }

  async cancel(userId: string, orderId: string, input: CancelOrderInput): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { subOrders: { select: { status: true } } },
    });
    if (!order) throw notFound('Order');
    if (!canCancel(order))
      throw forbidden(
        'This order can no longer be cancelled. If it has been delivered, request a return instead.',
        'NOT_CANCELLABLE',
      );
    await this.lifecycle.cancelOrder(orderId, {
      reason: input.reason,
      actorId: userId,
      actorLabel: 'Customer',
    });
    return this.get(userId, orderId);
  }
}
