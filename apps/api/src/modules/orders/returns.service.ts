import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/config.types';
import { Prisma } from '@gk/db';
import type { AdminReturnRow, ReturnRequestDto, ReturnStatus, SellerReturnRow } from '@gk/types';
import { fromPaise, toPaise } from '@gk/utils';
import type {
  AdminReturnDecisionInput,
  ReturnDecisionInput,
  ReturnRequestInput,
} from '@gk/validators';
import { badRequest, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/mail.templates';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductAggregatesService } from '../products/product-aggregates.service';
import { num } from '../products/products.mapper';
import { OrderLifecycleService } from './order-lifecycle.service';

const OPEN = ['REQUESTED', 'APPROVED', 'ESCALATED', 'PICKED_UP', 'RECEIVED'] as const;

const include = {
  orderItem: {
    select: {
      id: true,
      name: true,
      image: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      lineTotal: true,
      orderId: true,
      variantId: true,
      productId: true,
      order: { select: { orderNumber: true, paymentMethod: true, userId: true } },
    },
  },
  subOrder: {
    select: {
      id: true,
      sellerId: true,
      subtotal: true,
      total: true,
      sellerEarning: true,
      commissionAmount: true,
      payoutId: true,
      seller: { select: { storeName: true, userId: true } },
    },
  },
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ReturnRequestInclude;

type Row = Prisma.ReturnRequestGetPayload<{ include: typeof include }>;

const toDto = (r: Row): ReturnRequestDto => ({
  id: r.id,
  orderItemId: r.orderItemId,
  orderId: r.orderItem.orderId,
  orderNumber: r.orderItem.order.orderNumber,
  itemName: r.orderItem.name,
  itemImage: r.orderItem.image,
  quantity: r.quantity,
  reason: r.reason,
  description: r.description,
  images: r.images,
  status: r.status,
  sellerRemarks: r.sellerRemarks,
  adminRemarks: r.adminRemarks,
  refundAmount: r.refundAmount == null ? null : num(r.refundAmount),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const toSellerRow = (r: Row): SellerReturnRow => ({
  id: r.id,
  orderNumber: r.orderItem.order.orderNumber,
  subOrderId: r.subOrderId,
  itemName: r.orderItem.name,
  itemImage: r.orderItem.image,
  quantity: r.quantity,
  reason: r.reason,
  description: r.description,
  images: r.images,
  status: r.status,
  sellerRemarks: r.sellerRemarks,
  refundAmount: r.refundAmount == null ? null : num(r.refundAmount),
  customerName: r.user.name,
  createdAt: r.createdAt.toISOString(),
});

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly aggregates: ProductAggregatesService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  // ───────────── customer ─────────────

  async request(
    userId: string,
    input: ReturnRequestInput & { images: string[] },
  ): Promise<ReturnRequestDto> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: input.orderItemId, order: { userId } },
      include: {
        subOrder: { include: { seller: { select: { userId: true, storeName: true } } } },
        product: { select: { isReturnable: true, returnWindowDays: true, name: true } },
        returnRequests: true,
        order: { select: { orderNumber: true, id: true } },
      },
    });
    if (!item) throw notFound('Order item');
    if (item.subOrder.status !== 'DELIVERED' || !item.subOrder.deliveredAt)
      throw badRequest('NOT_DELIVERED', 'You can request a return once the item is delivered');
    if (!item.product.isReturnable)
      throw badRequest('NOT_RETURNABLE', 'This item is not eligible for return');
    const windowEnd =
      item.subOrder.deliveredAt.getTime() + item.product.returnWindowDays * 86_400_000;
    if (Date.now() > windowEnd)
      throw badRequest(
        'WINDOW_CLOSED',
        `The ${item.product.returnWindowDays}-day return window for this item has closed`,
      );

    const inFlight = item.returnRequests
      .filter((r) => (OPEN as readonly string[]).includes(r.status))
      .reduce((n, r) => n + r.quantity, 0);
    const remaining = item.quantity - item.returnedQty - inFlight;
    if (input.quantity > remaining)
      throw badRequest(
        'QUANTITY_EXCEEDS',
        remaining > 0
          ? `You can return at most ${remaining} more unit(s) of this item`
          : 'A return has already been requested for this item',
      );

    const created = await this.prisma.$transaction(async (tx) => {
      const r = await tx.returnRequest.create({
        data: {
          orderItemId: item.id,
          subOrderId: item.subOrderId,
          userId,
          quantity: input.quantity,
          reason: input.reason,
          description: input.description,
          images: input.images,
        },
        include,
      });
      await this.lifecycle.history(tx, {
        orderId: item.orderId,
        subOrderId: item.subOrderId,
        status: 'RETURN_REQUESTED',
        note: `${item.name} × ${input.quantity}: ${input.reason}`,
        actorId: userId,
      });
      return r;
    });
    await this.notifications.notify(item.subOrder.seller.userId, {
      type: 'ORDER',
      title: 'Return requested',
      body: `${item.name} (order ${item.order.orderNumber}) — ${input.reason}`,
      data: { returnId: created.id, link: '/seller/returns' },
    });
    return toDto(created);
  }

  async listMine(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PagedResult<ReturnRequestDto>> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paged(rows.map(toDto), page, limit, total);
  }

  /** A rejected return can be escalated to the platform as a dispute. */
  async escalate(userId: string, id: string, note?: string): Promise<ReturnRequestDto> {
    const r = await this.prisma.returnRequest.findFirst({ where: { id, userId }, include });
    if (!r) throw notFound('Return request');
    if (r.status !== 'REJECTED')
      throw badRequest('INVALID_STATE', 'Only rejected returns can be escalated');
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: 'ESCALATED',
        description: note ? `${r.description ?? ''}\n[Escalation] ${note}`.trim() : r.description,
      },
      include,
    });
    await this.notifications.notifyAdmins({
      type: 'ORDER',
      title: 'Return dispute escalated',
      body: `Order ${r.orderItem.order.orderNumber}: customer disputes the seller's decision.`,
      data: { returnId: id, link: '/admin/returns' },
    });
    return toDto(updated);
  }

  // ───────────── seller ─────────────

  async listForSeller(
    sellerId: string,
    page: number,
    limit: number,
    status?: ReturnStatus,
  ): Promise<PagedResult<SellerReturnRow>> {
    const where: Prisma.ReturnRequestWhereInput = {
      subOrder: { sellerId },
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paged(rows.map(toSellerRow), page, limit, total);
  }

  async sellerDecide(
    sellerId: string,
    id: string,
    input: ReturnDecisionInput,
  ): Promise<SellerReturnRow> {
    const r = await this.prisma.returnRequest.findFirst({
      where: { id, subOrder: { sellerId } },
      include,
    });
    if (!r) throw notFound('Return request');
    if (r.status !== 'REQUESTED')
      throw badRequest('INVALID_STATE', 'This return has already been handled');
    if (input.decision === 'REJECT' && !input.remarks)
      throw badRequest('REMARKS_REQUIRED', 'Please explain why the return is rejected');
    const status: ReturnStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: { status, sellerRemarks: input.remarks ?? null },
      include,
    });
    await this.customerUpdate(
      updated,
      status === 'APPROVED' ? 'Return approved' : 'Return rejected',
      status === 'APPROVED'
        ? 'The seller approved your return. Pack the item and hand it to the pickup agent.'
        : `The seller rejected your return: ${input.remarks}. You can escalate this to our team.`,
    );
    return toSellerRow(updated);
  }

  async sellerMarkReceived(sellerId: string, id: string): Promise<SellerReturnRow> {
    const r = await this.prisma.returnRequest.findFirst({
      where: { id, subOrder: { sellerId } },
      include,
    });
    if (!r) throw notFound('Return request');
    if (!['APPROVED', 'PICKED_UP'].includes(r.status))
      throw badRequest('INVALID_STATE', 'Only approved returns can be marked as received');
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: { status: 'RECEIVED' },
      include,
    });
    await this.customerUpdate(
      updated,
      'Return received',
      'The seller received your item. Your refund is being processed.',
    );
    await this.notifications.notifyAdmins({
      type: 'PAYMENT',
      title: 'Refund pending',
      body: `Return for ${r.orderItem.order.orderNumber} was received and awaits refund.`,
      data: { returnId: id, link: '/admin/returns' },
    });
    return toSellerRow(updated);
  }

  // ───────────── admin ─────────────

  async adminList(
    page: number,
    limit: number,
    status?: string,
    q?: string,
  ): Promise<PagedResult<AdminReturnRow>> {
    const where: Prisma.ReturnRequestWhereInput = {
      ...(status ? { status: status as ReturnStatus } : {}),
      ...(q
        ? {
            OR: [
              { orderItem: { order: { orderNumber: { contains: q, mode: 'insensitive' } } } },
              { orderItem: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paged(
      rows.map((r) => ({
        ...toSellerRow(r),
        sellerName: r.subOrder.seller.storeName,
        orderId: r.orderItem.orderId,
        paymentMethod: r.orderItem.order.paymentMethod,
        adminRemarks: r.adminRemarks,
      })),
      page,
      limit,
      total,
    );
  }

  async adminDecide(
    actorId: string,
    id: string,
    input: AdminReturnDecisionInput,
  ): Promise<ReturnRequestDto> {
    const r = await this.prisma.returnRequest.findUnique({ where: { id }, include });
    if (!r) throw notFound('Return request');

    if (input.decision === 'APPROVE') {
      if (!['ESCALATED', 'REJECTED', 'REQUESTED'].includes(r.status))
        throw badRequest('INVALID_STATE', 'This return cannot be approved from its current state');
      const u = await this.prisma.returnRequest.update({
        where: { id },
        data: { status: 'APPROVED', adminRemarks: input.remarks ?? null },
        include,
      });
      await this.customerUpdate(u, 'Return approved', 'Our team approved your return request.');
      await this.notifications.notify(r.subOrder.seller.userId, {
        type: 'ORDER',
        title: 'Return approved by admin',
        body: `Return for ${r.orderItem.name} was approved after review.`,
        data: { link: '/seller/returns' },
      });
      return toDto(u);
    }
    if (input.decision === 'REJECT') {
      if (!['ESCALATED', 'REQUESTED', 'APPROVED'].includes(r.status))
        throw badRequest('INVALID_STATE', 'This return cannot be rejected from its current state');
      if (!input.remarks)
        throw badRequest('REMARKS_REQUIRED', 'Please add remarks for the customer');
      const u = await this.prisma.returnRequest.update({
        where: { id },
        data: { status: 'CLOSED', adminRemarks: input.remarks },
        include,
      });
      await this.customerUpdate(
        u,
        'Return closed',
        `After review, the return was closed: ${input.remarks}`,
      );
      return toDto(u);
    }
    return this.refund(actorId, r, input);
  }

  /** Create + process the refund for an approved / received / escalated return and book the seller-side adjustment. */
  private async refund(
    actorId: string,
    r: Row,
    input: AdminReturnDecisionInput,
  ): Promise<ReturnRequestDto> {
    if (!['APPROVED', 'PICKED_UP', 'RECEIVED', 'ESCALATED'].includes(r.status))
      throw badRequest('INVALID_STATE', 'Approve the return before refunding it');
    const item = r.orderItem;
    // refund = what the customer actually paid for the returned units (after coupon share)
    const perUnitPaise = Math.round(
      (toPaise(num(item.lineTotal)) - toPaise(num(item.discount))) / item.quantity,
    );
    const defaultPaise = perUnitPaise * r.quantity;
    const refundPaise =
      input.refundAmount !== undefined ? toPaise(input.refundAmount) : defaultPaise;
    if (refundPaise <= 0 || refundPaise > defaultPaise)
      throw badRequest(
        'INVALID_AMOUNT',
        `Refund must be between ₹0.01 and ₹${fromPaise(defaultPaise)}`,
      );

    let refundId = '';
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { orderId: item.orderId },
        orderBy: { createdAt: 'desc' },
      });
      const refund = await tx.refund.create({
        data: {
          orderId: item.orderId,
          paymentId: payment?.id,
          returnRequestId: r.id,
          amount: fromPaise(refundPaise),
          reason: `Return: ${r.reason}`,
          notes: input.remarks,
        },
      });
      refundId = refund.id;
      await tx.returnRequest.update({
        where: { id: r.id },
        data: {
          status: 'REFUNDED',
          refundAmount: fromPaise(refundPaise),
          adminRemarks: input.remarks ?? r.adminRemarks,
        },
      });
      await tx.orderItem.update({
        where: { id: item.id },
        data: { returnedQty: { increment: r.quantity } },
      });
      // returned units go back on the shelf
      await this.lifecycle.restock(tx, [{ variantId: item.variantId, quantity: r.quantity }]);

      // seller side: reduce earnings in proportion (only while the sub-order is still unsettled)
      const sub = r.subOrder;
      const ratio =
        (toPaise(num(item.unitPrice)) * r.quantity) / Math.max(toPaise(num(sub.subtotal)), 1);
      if (!sub.payoutId) {
        await tx.subOrder.update({
          where: { id: sub.id },
          data: {
            sellerEarning: { decrement: Math.round(toPaise(num(sub.sellerEarning)) * ratio) / 100 },
            commissionAmount: {
              decrement: Math.round(toPaise(num(sub.commissionAmount)) * ratio) / 100,
            },
          },
        });
      }
      const all = await tx.orderItem.findMany({
        where: { subOrderId: sub.id },
        select: { quantity: true, returnedQty: true },
      });
      if (all.every((i) => i.returnedQty >= i.quantity)) {
        await tx.subOrder.update({ where: { id: sub.id }, data: { status: 'RETURNED' } });
        await this.lifecycle.recomputeStatus(tx, item.orderId, actorId);
      }
      await this.lifecycle.history(tx, {
        orderId: item.orderId,
        subOrderId: sub.id,
        status: 'RETURN_REFUNDED',
        note: `${item.name} × ${r.quantity} refunded`,
        actorId,
      });
    });
    await this.lifecycle.processRefund(refundId);
    await this.aggregates.recomputeStock([item.productId]);
    await this.aggregates.invalidateDetail([item.productId]);

    const updated = await this.prisma.returnRequest.findUniqueOrThrow({
      where: { id: r.id },
      include,
    });
    await this.customerUpdate(
      updated,
      'Refund issued',
      `₹${fromPaise(refundPaise).toLocaleString('en-IN')} is being refunded for ${item.name}.`,
    );
    return toDto(updated);
  }

  private async customerUpdate(r: Row, headline: string, detail: string) {
    await this.notifications.notify(r.userId, {
      type: 'ORDER',
      title: headline,
      body: detail,
      data: { returnId: r.id, orderId: r.orderItem.orderId, link: '/account/returns' },
    });
    if (r.user.email) {
      await this.mail.send({
        to: r.user.email,
        ...mailTemplates.returnUpdate({
          name: r.user.name,
          orderNumber: r.orderItem.order.orderNumber,
          headline,
          detail,
          url: `${this.config.get('WEB_URL', { infer: true }).replace(/\/$/, '')}/account/returns`,
        }),
      });
    }
  }
}
