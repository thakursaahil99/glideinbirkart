import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/config.types';

export interface GatewayOrder {
  id: string;
  amountPaise: number;
  currency: string;
}

export interface GatewayRefund {
  id: string;
  status: 'processed' | 'pending';
}

/**
 * Payment provider facade. Uses Razorpay when API keys are configured; otherwise a deterministic
 * in-process mock that mirrors Razorpay's order → payment → signature contract so the whole
 * checkout (web, mobile and tests) works offline.
 */
@Injectable()
export class PaymentGateway {
  private readonly log = new Logger(PaymentGateway.name);
  private readonly razorpay?: Razorpay;
  readonly keyId: string;
  private readonly secret: string;
  private readonly webhookSecret: string;
  readonly mock: boolean;

  constructor(@Inject(ConfigService) config: AppConfig) {
    const keyId = config.get('RAZORPAY_KEY_ID', { infer: true });
    const keySecret = config.get('RAZORPAY_KEY_SECRET', { infer: true });
    this.mock = !(keyId && keySecret);
    if (this.mock) {
      this.keyId = 'rzp_test_mock';
      // deterministic per-install secret derived from the JWT secret
      this.secret = createHmac('sha256', config.get('JWT_ACCESS_SECRET', { infer: true }))
        .update('mock-razorpay')
        .digest('hex');
      this.webhookSecret = createHmac('sha256', this.secret).update('webhook').digest('hex');
      this.log.warn(
        'Razorpay keys not set → using the built-in MOCK payment gateway (test mode only).',
      );
    } else {
      this.keyId = keyId as string;
      this.secret = keySecret as string;
      this.webhookSecret =
        config.get('RAZORPAY_WEBHOOK_SECRET', { infer: true }) ?? (keySecret as string);
      this.razorpay = new Razorpay({ key_id: this.keyId, key_secret: this.secret });
    }
  }

  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<GatewayOrder> {
    if (this.razorpay) {
      const o = await this.razorpay.orders.create({
        amount: input.amountPaise,
        currency: 'INR',
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      });
      return { id: o.id, amountPaise: Number(o.amount), currency: o.currency };
    }
    return {
      id: `order_mock_${randomBytes(9).toString('hex')}`,
      amountPaise: input.amountPaise,
      currency: 'INR',
    };
  }

  private hmac(secret: string, payload: string | Buffer) {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  private safeEqual(a: string, b: string) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  /** Checkout signature: HMAC_SHA256(order_id|payment_id, key_secret) */
  verifyPaymentSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    return this.safeEqual(
      this.hmac(this.secret, `${input.orderId}|${input.paymentId}`),
      input.signature,
    );
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature) return false;
    return this.safeEqual(this.hmac(this.webhookSecret, rawBody), signature);
  }

  async refund(input: {
    paymentId: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<GatewayRefund> {
    if (this.razorpay) {
      const r = await this.razorpay.payments.refund(input.paymentId, {
        amount: input.amountPaise,
        notes: input.notes,
      });
      return { id: r.id, status: r.status === 'processed' ? 'processed' : 'pending' };
    }
    return { id: `rfnd_mock_${randomBytes(8).toString('hex')}`, status: 'processed' };
  }

  // ── mock-only helpers (never reachable when real keys are configured) ──

  /** Produces what Razorpay Checkout would hand back after a successful payment. */
  mockCapture(orderId: string): { paymentId: string; signature: string } {
    if (!this.mock) throw new Error('Mock gateway is disabled');
    const paymentId = `pay_mock_${randomBytes(9).toString('hex')}`;
    return { paymentId, signature: this.hmac(this.secret, `${orderId}|${paymentId}`) };
  }

  signMockWebhook(body: string): string {
    if (!this.mock) throw new Error('Mock gateway is disabled');
    return this.hmac(this.webhookSecret, body);
  }
}
