import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { OrderDto } from '@gk/types';
import type { VerifyPaymentInput } from '@gk/validators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { orderInclude, toOrderDto } from '../orders/orders.mapper';
import { PaymentGateway } from './gateway';

export type ConfirmResult = 'confirmed' | 'already_processed' | 'revived' | 'refunded';

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  private async loadDto(orderId: string): Promise<OrderDto> {
    return toOrderDto(
      await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }),
    );
  }

  /** Client-side callback after Razorpay Checkout succeeds: verify the HMAC signature, then confirm. */
  async verify(userId: string, input: VerifyPaymentInput): Promise<OrderDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: input.razorpayOrderId, orderId: input.orderId },
      include: { order: { select: { id: true, userId: true } } },
    });
    if (!payment) throw notFound('Payment');
    if (payment.order.userId !== userId) throw forbidden();
    const ok = this.gateway.verifyPaymentSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    if (!ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { failureReason: 'Signature verification failed' },
      });
      throw badRequest(
        'INVALID_SIGNATURE',
        'Payment verification failed. If money was deducted it will be refunded automatically.',
      );
    }
    await this.confirmPaid(payment.orderId, input.razorpayPaymentId, input.razorpaySignature);
    return this.loadDto(payment.orderId);
  }

  /**
   * Idempotent: safe to call from both the browser callback and the webhook.
   * A payment that lands after the reservation expired re-reserves stock if possible, else is refunded.
   */
  async confirmPaid(
    orderId: string,
    providerPaymentId: string,
    signature?: string,
  ): Promise<ConfirmResult> {
    let result = 'already_processed' as ConfirmResult;
    let lateRefundId = null as string | null;

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payments: true },
      });
      if (!order) throw notFound('Order');
      const payment = order.payments.find((p) => p.method === 'RAZORPAY');
      if (!payment)
        throw badRequest('NO_PAYMENT', 'No online payment is associated with this order');
      if (
        payment.status === 'PAID' ||
        payment.status === 'REFUNDED' ||
        payment.status === 'PARTIALLY_REFUNDED'
      )
        return;

      const markPaid = () =>
        tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            providerPaymentId,
            signature: signature ?? null,
            paidAt: new Date(),
            failureReason: null,
          },
        });

      if (order.status === 'PENDING_PAYMENT') {
        await markPaid();
        await this.lifecycle.confirmInTx(tx, orderId, 'Payment received');
        result = 'confirmed';
        return;
      }

      if (order.status === 'PAYMENT_FAILED' || order.status === 'CANCELLED') {
        // money arrived for an order we already released → try to take the stock back
        try {
          await tx.$executeRaw`SAVEPOINT revive`;
          await this.lifecycle.reserve(
            tx,
            order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          );
          await tx.subOrder.updateMany({
            where: { orderId },
            data: { status: 'PENDING', cancelledAt: null, cancelReason: null },
          });
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'PENDING_PAYMENT', cancelledAt: null, cancelReason: null },
          });
          await markPaid();
          await this.lifecycle.confirmInTx(
            tx,
            orderId,
            'Payment received after expiry — order revived',
          );
          result = 'revived';
        } catch (err) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT revive`;
          this.log.warn(
            `late payment for ${orderId} could not revive order (${(err as Error).message}); refunding`,
          );
          await markPaid();
          const refund = await tx.refund.create({
            data: {
              orderId,
              paymentId: payment.id,
              amount: payment.amount,
              reason: 'Payment received after the order expired',
              notes: 'Auto-refund',
            },
          });
          lateRefundId = refund.id;
          result = 'refunded';
        }
      }
    });

    if (result === 'confirmed' || result === 'revived') await this.lifecycle.afterPlaced(orderId);
    if (lateRefundId) await this.lifecycle.processRefund(lateRefundId);
    return result;
  }

  async markFailed(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<{ recorded: boolean }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, status: true },
    });
    if (!order) throw notFound('Order');
    if (order.status !== 'PENDING_PAYMENT') return { recorded: false };
    await this.prisma.payment.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { failureReason: (reason ?? 'Payment failed or was cancelled').slice(0, 300) },
    });
    await this.lifecycle.history(this.prisma, {
      orderId,
      status: 'PAYMENT_ATTEMPT_FAILED',
      note: reason ?? 'Payment failed or was cancelled',
    });
    return { recorded: true };
  }

  /** Mock-gateway helper: behaves like Razorpay Checkout returning payment credentials. */
  async mockComplete(userId: string, orderId: string, success: boolean) {
    if (!this.gateway.mock)
      throw forbidden('The mock gateway is disabled when real Razorpay keys are configured');
    const payment = await this.prisma.payment.findFirst({ where: { orderId, order: { userId } } });
    if (!payment?.providerOrderId) throw notFound('Payment');
    if (!success) {
      await this.markFailed(userId, orderId, 'Payment cancelled by user (mock)');
      return { success: false as const };
    }
    const { paymentId, signature } = this.gateway.mockCapture(payment.providerOrderId);
    return {
      success: true as const,
      razorpayOrderId: payment.providerOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    };
  }

  // ───────────── webhook ─────────────

  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    eventId: string | undefined,
  ): Promise<{ status: string }> {
    if (!this.gateway.verifyWebhookSignature(rawBody, signature))
      throw forbidden('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: {
        payment?: { entity?: { id: string; order_id?: string; error_description?: string } };
        refund?: { entity?: { id: string; payment_id?: string } };
        order?: { entity?: { id: string } };
      };
    };

    // Idempotency: Razorpay retries deliveries, so each event id is processed once.
    const id =
      eventId ??
      `${event.event}:${event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id ?? rawBody.length}`;
    try {
      await this.prisma.webhookEvent.create({
        data: {
          id,
          provider: 'razorpay',
          type: event.event,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        return { status: 'duplicate' };
      throw err;
    }

    const entity = event.payload?.payment?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const providerOrderId = entity?.order_id ?? event.payload?.order?.entity?.id;
        if (!providerOrderId || !entity?.id) return { status: 'ignored' };
        const payment = await this.prisma.payment.findUnique({ where: { providerOrderId } });
        if (!payment) return { status: 'unknown_order' };
        await this.confirmPaid(payment.orderId, entity.id);
        return { status: 'processed' };
      }
      case 'payment.failed': {
        if (entity?.order_id) {
          await this.prisma.payment.updateMany({
            where: { providerOrderId: entity.order_id, status: 'PENDING' },
            data: { failureReason: entity.error_description ?? 'Payment failed' },
          });
        }
        return { status: 'processed' };
      }
      case 'refund.processed': {
        const refundId = event.payload?.refund?.entity?.id;
        if (refundId)
          await this.prisma.refund.updateMany({
            where: { providerRefundId: refundId },
            data: { status: 'PROCESSED', processedAt: new Date() },
          });
        return { status: 'processed' };
      }
      default:
        return { status: 'ignored' };
    }
  }
}
