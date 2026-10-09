'use client';

import { useState } from 'react';
import { Check, CircleAlert, Package, PackageCheck, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { RETURN_REASONS } from '@gk/types';
import type { OrderDto, OrderItemDto, StatusHistoryDto } from '@gk/types';
import { hooks } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { ImageUploader } from './image-uploader';

const STEPS = [
  { key: 'PLACED', label: 'Placed', icon: Package },
  { key: 'PROCESSING', label: 'Packed', icon: PackageCheck },
  { key: 'SHIPPED', label: 'Shipped', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Check },
] as const;
const ORDER_RANK: Record<string, number> = {
  PENDING_PAYMENT: -1,
  PLACED: 0,
  PROCESSING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
};

/** Horizontal progress stepper for the overall order state. */
export function OrderStepper({ status }: { status: OrderDto['status'] }) {
  if (status === 'CANCELLED' || status === 'PAYMENT_FAILED') {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
      >
        <X className="size-5" />{' '}
        {status === 'CANCELLED' ? 'This order was cancelled' : 'Payment was not completed'}
      </div>
    );
  }
  const rank = ORDER_RANK[status] ?? 0;
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = rank >= i;
        const Icon = s.icon;
        return (
          <li
            key={s.key}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
            aria-current={rank === i ? 'step' : undefined}
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1/2 top-[1.15rem] h-1 w-full rounded-full',
                  rank >= i ? 'bg-primary' : 'bg-muted',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-10 place-content-center rounded-full border-2 transition-colors',
                done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground',
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span
              className={cn(
                'text-xs font-semibold',
                done ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Order received — awaiting payment',
  PLACED: 'Order placed',
  ACCEPTED: 'Seller accepted the order',
  PACKED: 'Packed by seller',
  PROCESSING: 'Being prepared',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PAYMENT_FAILED: 'Payment failed',
  PAYMENT_ATTEMPT_FAILED: 'Payment attempt failed',
  RETURN_REQUESTED: 'Return requested',
  RETURN_REFUNDED: 'Return refunded',
};

export function OrderTimeline({ events }: { events: StatusHistoryDto[] }) {
  const items = [...events].reverse();
  return (
    <ol className="relative space-y-5 border-l-2 border-dashed pl-6">
      {items.map((e, i) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              'absolute -left-[1.95rem] top-1 grid size-4 place-content-center rounded-full ring-4 ring-card',
              i === 0 ? 'bg-primary' : 'bg-border',
            )}
          />
          <p className={cn('text-sm', i === 0 ? 'font-bold' : 'font-semibold')}>
            {LABELS[e.status] ?? titleCase(e.status)}
          </p>
          {e.note && <p className="text-sm text-muted-foreground">{e.note}</p>}
          <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

export function ReturnDialog({
  item,
  open,
  onOpenChange,
}: {
  item: OrderItemDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const request = hooks.useRequestReturn();
  const max = Math.max(item.quantity - item.returnedQty, 1);
  const [reason, setReason] = useState<(typeof RETURN_REASONS)[number]>(RETURN_REASONS[0]);
  const [qty, setQty] = useState(1);
  const [desc, setDesc] = useState('');
  const [images, setImages] = useState<string[]>([]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return or refund request</DialogTitle>
          <DialogDescription className="line-clamp-2">{item.name}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate(
              {
                orderItemId: item.id,
                quantity: qty,
                reason,
                description: desc || undefined,
                images,
              },
              {
                onSuccess: () => {
                  toast.success('Return requested. The seller will review it shortly.');
                  onOpenChange(false);
                },
                onError: (err) => toast.error(errMsg(err)),
              },
            );
          }}
        >
          <Field label="Reason" htmlFor="ret-reason" required>
            <Select
              id="ret-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof RETURN_REASONS)[number])}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          {max > 1 && (
            <Field label="Quantity" htmlFor="ret-qty">
              <Select id="ret-qty" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Tell us more (optional)" htmlFor="ret-desc">
            <Textarea
              id="ret-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={1000}
              placeholder="What went wrong?"
            />
          </Field>
          <Field label="Photos (optional)" hint="Helps the seller approve faster">
            <ImageUploader folder="returns" max={4} value={images} onChange={setImages} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={request.isPending}>
            Submit request
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const cancel = hooks.useCancelOrder();
  const [reason, setReason] = useState('Ordered by mistake');
  const reasons = [
    'Ordered by mistake',
    'Found a better price',
    'Delivery is taking too long',
    'Want to change address / items',
    'Other',
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleAlert className="size-5 text-destructive" /> Cancel order {order.orderNumber}?
          </DialogTitle>
          <DialogDescription>
            {order.paymentStatus === 'PAID'
              ? 'Your payment will be refunded to the original payment method.'
              : 'You have not been charged for this order.'}
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason for cancelling" htmlFor="cancel-reason">
          <Select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            loading={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { id: order.id, reason },
                {
                  onSuccess: () => {
                    toast.success('Order cancelled');
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(errMsg(e)),
                },
              )
            }
          >
            Cancel order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
