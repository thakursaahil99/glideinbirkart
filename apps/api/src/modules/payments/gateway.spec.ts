import type { AppConfig } from '../../config/config.types';
import { PaymentGateway } from './gateway';

function make(env: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    JWT_ACCESS_SECRET: 'unit-test-secret-unit-test-secret-1234',
    ...env,
  };
  return new PaymentGateway({ get: (key: string) => values[key] } as unknown as AppConfig);
}

describe('PaymentGateway (mock mode)', () => {
  const gw = make();

  it('runs in mock mode without Razorpay keys', () => {
    expect(gw.mock).toBe(true);
    expect(gw.keyId).toBe('rzp_test_mock');
  });

  it('creates orders with the requested amount', async () => {
    const o = await gw.createOrder({ amountPaise: 129900, receipt: 'GK-1' });
    expect(o.id).toMatch(/^order_mock_/);
    expect(o).toMatchObject({ amountPaise: 129900, currency: 'INR' });
  });

  it('accepts the signature of a captured payment', () => {
    const { paymentId, signature } = gw.mockCapture('order_x');
    expect(gw.verifyPaymentSignature({ orderId: 'order_x', paymentId, signature })).toBe(true);
  });

  it('rejects tampered order ids, payment ids and signatures', () => {
    const { paymentId, signature } = gw.mockCapture('order_x');
    expect(gw.verifyPaymentSignature({ orderId: 'order_y', paymentId, signature })).toBe(false);
    expect(
      gw.verifyPaymentSignature({ orderId: 'order_x', paymentId: 'pay_other', signature }),
    ).toBe(false);
    expect(
      gw.verifyPaymentSignature({ orderId: 'order_x', paymentId, signature: 'deadbeef' }),
    ).toBe(false);
    expect(gw.verifyPaymentSignature({ orderId: 'order_x', paymentId, signature: '' })).toBe(false);
  });

  it('signs and verifies webhooks, rejecting missing or wrong signatures', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(gw.verifyWebhookSignature(body, gw.signMockWebhook(body))).toBe(true);
    expect(gw.verifyWebhookSignature(Buffer.from(body), gw.signMockWebhook(body))).toBe(true);
    expect(gw.verifyWebhookSignature(body + ' ', gw.signMockWebhook(body))).toBe(false);
    expect(gw.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(gw.verifyWebhookSignature(body, 'nope')).toBe(false);
  });

  it('refunds instantly in mock mode', async () => {
    await expect(gw.refund({ paymentId: 'pay_1', amountPaise: 5000 })).resolves.toMatchObject({
      status: 'processed',
    });
  });

  it('derives a different secret per JWT secret, so signatures do not transfer between installs', () => {
    const other = make({ JWT_ACCESS_SECRET: 'a-completely-different-secret-value-9999' });
    const { paymentId, signature } = gw.mockCapture('order_x');
    expect(other.verifyPaymentSignature({ orderId: 'order_x', paymentId, signature })).toBe(false);
  });
});

describe('PaymentGateway (real keys configured)', () => {
  const gw = make({
    RAZORPAY_KEY_ID: 'rzp_test_abc123',
    RAZORPAY_KEY_SECRET: 'supersecretvalue',
    RAZORPAY_WEBHOOK_SECRET: 'whsec',
  });

  it('is not in mock mode and disables mock-only helpers', () => {
    expect(gw.mock).toBe(false);
    expect(gw.keyId).toBe('rzp_test_abc123');
    expect(() => gw.mockCapture('order_x')).toThrow('Mock gateway is disabled');
    expect(() => gw.signMockWebhook('{}')).toThrow('Mock gateway is disabled');
  });

  it('verifies checkout signatures with HMAC_SHA256(order|payment, secret)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const signature = createHmac('sha256', 'supersecretvalue')
      .update('order_1|pay_1')
      .digest('hex');
    expect(gw.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature })).toBe(
      true,
    );
    expect(gw.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_2', signature })).toBe(
      false,
    );
  });
});
