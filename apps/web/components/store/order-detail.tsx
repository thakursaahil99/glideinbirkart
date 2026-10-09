'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CreditCard, Download, ExternalLink, MapPin, RotateCcw, Star, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { CheckoutResult, OrderDto, OrderItemDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { api, hooks } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { errMsg } from '@/lib/forms';
import { formatDateTime } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Img } from '@/components/ui/img';
import { CancelOrderDialog, OrderStepper, OrderTimeline, ReturnDialog } from './order-parts';
import { usePayOrder } from './payment';
import { PriceSummary } from './price-summary';
import { WriteReview } from './reviews';
import { useQueryClient } from '@tanstack/react-query';

function ItemRow({
  item,
  onReturn,
  onReview,
}: {
  item: OrderItemDto;
  onReturn: () => void;
  onReview: () => void;
}) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <Link
        href={`/products/${item.slug}`}
        className="relative size-20 shrink-0 overflow-hidden rounded-xl border bg-muted"
      >
        <Img src={item.image} alt={item.name} fill sizes="80px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/products/${item.slug}`}
          className="line-clamp-2 font-semibold hover:text-primary"
        >
          {item.name}
        </Link>
        {item.variantName && item.variantName !== 'Default' && (
          <p className="text-sm text-muted-foreground">{item.variantName}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Qty {item.quantity} · {formatINR(item.unitPrice)} each
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.canReview && (
            <Button size="xs" variant="secondary" onClick={onReview}>
              <Star /> Rate & review
            </Button>
          )}
          {item.canReturn && (
            <Button size="xs" variant="outline" onClick={onReturn}>
              <RotateCcw /> Return
            </Button>
          )}
          {item.returnRequest && (
            <Link
              href="/account/returns"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              Return <StatusBadge status={item.returnRequest.status} />
            </Link>
          )}
          {item.reviewed && <span className="text-xs font-semibold text-success">✓ Reviewed</span>}
        </div>
      </div>
      <p className="font-bold">{formatINR(item.lineTotal - item.discount)}</p>
    </li>
  );
}

export function OrderDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: order, isLoading, error } = hooks.useOrder(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<OrderItemDto | null>(null);
  const [reviewItem, setReviewItem] = useState<OrderItemDto | null>(null);
  const [retrying, setRetrying] = useState(false);
  const { startPayment, MockDialog } = usePayOrder({
    onPaid: (o) => {
      qc.setQueryData(['order', o.id], o);
      toast.success('Payment received — thank you!');
    },
    onFailed: () => void qc.invalidateQueries({ queryKey: ['order', id] }),
  });

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  if (error || !order)
    return (
      <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
        {errMsg(error, 'Order not found')}
      </p>
    );

  const retry = async () => {
    setRetrying(true);
    try {
      const res: CheckoutResult = await api.payments.retry(order.id);
      await startPayment(res);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRetrying(false);
    }
  };
  const invoice = async () => {
    try {
      downloadBlob(await api.orders.invoice(order.id), `invoice-${order.orderNumber}.pdf`);
    } catch (e) {
      toast.error(errMsg(e, 'Invoice not available yet'));
    }
  };
  const a = order.shippingAddress;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Order</p>
          <h1
            className="font-display text-2xl font-extrabold sm:text-3xl"
            data-testid="order-number"
          >
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed on {formatDateTime(order.placedAt ?? order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          {order.hasInvoice && (
            <Button size="sm" variant="outline" onClick={invoice}>
              <Download /> Invoice
            </Button>
          )}
          {order.canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancel order
            </Button>
          )}
        </div>
      </header>

      {order.status === 'PENDING_PAYMENT' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium">
            Payment pending. Complete it before <b>{formatDateTime(order.expiresAt)}</b> to keep
            your items reserved.
          </p>
          <Button onClick={retry} loading={retrying} data-testid="retry-payment">
            <CreditCard /> Pay {formatINR(order.pricing.total, true)}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-5 sm:p-6">
          <OrderStepper status={order.status} />
        </CardContent>
      </Card>

      {order.subOrders.map((s) => (
        <Card key={s.id}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Store className="size-4 text-primary" /> {s.seller.storeName}{' '}
              <StatusBadge status={s.status} />
            </CardTitle>
            {s.trackingId && (
              <p className="text-sm text-muted-foreground">
                {s.courier} · <b className="text-foreground">{s.trackingId}</b>{' '}
                {s.trackingUrl && (
                  <a
                    href={s.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    Track <ExternalLink className="size-3" />
                  </a>
                )}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {s.items.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  onReturn={() => setReturnItem(i)}
                  onReview={() => setReviewItem(i)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order updates</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTimeline events={order.timeline} />
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" /> Delivery address
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">{a.fullName}</p>
              <p>
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}
                {a.landmark ? `, ${a.landmark}` : ''}
              </p>
              <p>
                {a.city}, {a.state} – {a.pincode}
              </p>
              <p>Phone: {a.phone}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payment & price details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Method</span>
                <span className="font-semibold">
                  {order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online (Razorpay)'} ·{' '}
                  <StatusBadge status={order.paymentStatus} />
                </span>
              </p>
              <PriceSummary pricing={order.pricing} showFreeDeliveryProgress={false} />
            </CardContent>
          </Card>
        </div>
      </div>

      {cancelOpen && (
        <CancelOrderDialog order={order as OrderDto} open onOpenChange={setCancelOpen} />
      )}
      {returnItem && (
        <ReturnDialog item={returnItem} open onOpenChange={(o) => !o && setReturnItem(null)} />
      )}
      {reviewItem && (
        <WriteReview
          productId={reviewItem.productId}
          orderItemId={reviewItem.id}
          open
          onOpenChange={(o) => !o && setReviewItem(null)}
        />
      )}
      {MockDialog}
    </div>
  );
}
