import type { CheckoutResult, OrderDto } from '@gk/types';
import { api } from './api';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type PayOutcome =
  | { status: 'paid'; order: OrderDto }
  | { status: 'cancelled'; reason: string }
  | { status: 'unavailable'; reason: string };

function verify(orderId: string, r: RazorpayResponse) {
  return api.payments.verify({
    orderId,
    razorpayOrderId: r.razorpay_order_id,
    razorpayPaymentId: r.razorpay_payment_id,
    razorpaySignature: r.razorpay_signature,
  });
}

/**
 * Online payment for an order created by POST /checkout.
 * - Mock gateway (no Razorpay keys on the server): the API signs a fake payment, so the whole flow works in Expo Go.
 * - Real Razorpay: the native SDK (needs a development build; it is not part of Expo Go).
 */
export async function payForOrder(result: CheckoutResult): Promise<PayOutcome> {
  const payload = result.razorpay;
  if (!payload) return { status: 'unavailable', reason: 'No payment is required for this order.' };
  const orderId = result.order.id;

  if (payload.mock) {
    const res = await api.payments.mockComplete(orderId, true);
    if (!res.success) return { status: 'cancelled', reason: 'Payment cancelled' };
    const order = await verify(orderId, {
      razorpay_order_id: res.razorpayOrderId,
      razorpay_payment_id: res.razorpayPaymentId,
      razorpay_signature: res.razorpaySignature,
    });
    return { status: 'paid', order };
  }

  let checkout: { open(options: Record<string, unknown>): Promise<RazorpayResponse> };
  try {
    // Loaded lazily: the native module is missing in Expo Go, which must not crash the whole app.
    checkout = (require('react-native-razorpay') as { default: typeof checkout }).default;
    if (!checkout?.open) throw new Error('missing');
  } catch {
    return {
      status: 'unavailable',
      reason:
        'Online payments need the full app build (not Expo Go). You can pay later from My Orders, or choose Cash on Delivery.',
    };
  }

  try {
    const r = await checkout.open({
      key: payload.keyId,
      amount: payload.amount,
      currency: payload.currency,
      name: payload.name,
      description: payload.description,
      order_id: payload.orderId,
      prefill: payload.prefill,
      theme: { color: '#4338ca' },
    });
    return { status: 'paid', order: await verify(orderId, r) };
  } catch (e) {
    const reason =
      (e as { description?: string; error?: { description?: string } })?.description ??
      (e as { error?: { description?: string } })?.error?.description ??
      'Payment cancelled';
    void api.payments.failed(orderId, reason).catch(() => undefined);
    return { status: 'cancelled', reason };
  }
}
