'use client';

import { useCallback, useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { CheckoutResult, OrderDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';

type RazorpayPayload = NonNullable<CheckoutResult['razorpay']>;
interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Online payment orchestration (Razorpay Checkout, or the built-in mock gateway when no keys are configured).
 * `onPaid` receives the confirmed order; `onFailed` is called when the user dismisses or the payment fails.
 */
export function usePayOrder(opts: {
  onPaid: (order: OrderDto) => void;
  onFailed?: (orderId: string, reason: string) => void;
}) {
  const [mock, setMock] = useState<{ result: CheckoutResult; payload: RazorpayPayload } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const verify = useCallback(
    async (orderId: string, r: RazorpayResponse) => {
      const order = await api.payments.verify({
        orderId,
        razorpayOrderId: r.razorpay_order_id,
        razorpayPaymentId: r.razorpay_payment_id,
        razorpaySignature: r.razorpay_signature,
      });
      opts.onPaid(order);
    },
    [opts],
  );

  const startPayment = useCallback(
    async (result: CheckoutResult) => {
      const payload = result.razorpay;
      if (!payload) return;
      if (payload.mock) return setMock({ result, payload });
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        toast.error(
          'Could not load the payment window. Check your connection and retry from your orders.',
        );
        return opts.onFailed?.(result.order.id, 'Payment script failed to load');
      }
      const rzp = new window.Razorpay({
        key: payload.keyId,
        amount: payload.amount,
        currency: payload.currency,
        name: payload.name,
        description: payload.description,
        order_id: payload.orderId,
        prefill: payload.prefill,
        theme: { color: '#4338ca' },
        handler: (r: RazorpayResponse) => {
          verify(result.order.id, r).catch((e) => {
            toast.error(errMsg(e, 'Payment verification failed'));
            opts.onFailed?.(result.order.id, 'verification failed');
          });
        },
        modal: {
          ondismiss: () => {
            void api.payments
              .failed(result.order.id, 'Payment window closed')
              .catch(() => undefined);
            opts.onFailed?.(result.order.id, 'Payment window closed');
          },
        },
      });
      rzp.on('payment.failed', (r) => {
        void api.payments.failed(result.order.id, r.error?.description).catch(() => undefined);
        toast.error(r.error?.description ?? 'Payment failed');
      });
      rzp.open();
    },
    [opts, verify],
  );

  const complete = async (success: boolean) => {
    if (!mock) return;
    setBusy(true);
    try {
      const orderId = mock.result.order.id;
      const res = await api.payments.mockComplete(orderId, success);
      if (res.success) {
        await verify(orderId, {
          razorpay_order_id: res.razorpayOrderId,
          razorpay_payment_id: res.razorpayPaymentId,
          razorpay_signature: res.razorpaySignature,
        });
      } else {
        toast.error('Payment cancelled');
        opts.onFailed?.(orderId, 'cancelled');
      }
      setMock(null);
    } catch (e) {
      toast.error(errMsg(e, 'Payment failed'));
    } finally {
      setBusy(false);
    }
  };

  const MockDialog = mock ? (
    <Dialog
      open
      onOpenChange={(o) =>
        !o && !busy && (setMock(null), opts.onFailed?.(mock.result.order.id, 'dismissed'))
      }
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" /> Test payment gateway
          </DialogTitle>
          <DialogDescription>
            No Razorpay keys are configured, so payments are simulated. In production this window is
            Razorpay Checkout.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-secondary/60 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Amount to pay
          </p>
          <p className="font-display text-3xl font-extrabold">
            {formatINR(mock.payload.amount / 100, true)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Order {mock.result.order.orderNumber}
          </p>
        </div>
        <Button
          size="lg"
          variant="success"
          onClick={() => complete(true)}
          loading={busy}
          data-testid="mock-pay-success"
        >
          <ShieldCheck /> Pay now (success)
        </Button>
        <Button
          variant="outline"
          onClick={() => complete(false)}
          disabled={busy}
          data-testid="mock-pay-fail"
        >
          Simulate failure
        </Button>
      </DialogContent>
    </Dialog>
  ) : null;

  return { startPayment, MockDialog };
}
