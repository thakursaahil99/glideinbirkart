'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, MapPin, PackageCheck, Printer, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { shipSubOrderSchema } from '@gk/validators';
import { formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { applyApiError, errMsg, useZodForm } from '@/lib/forms';
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
import { Field, Input } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { OrderTimeline } from '@/components/store/order-parts';
import { PageHeader, ReasonDialog } from '@/components/dashboard/common';

function ShipDialog({
  id,
  open,
  onOpenChange,
  onDone,
}: {
  id: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const form = useZodForm(shipSubOrderSchema, {
    defaultValues: { courier: 'Delhivery', trackingId: '', trackingUrl: '' },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Ship this order</DialogTitle>
          <DialogDescription>
            The customer is notified with these tracking details.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await api.seller.orders.ship(id, v);
              toast.success('Marked as shipped');
              onOpenChange(false);
              onDone();
            } catch (err) {
              applyApiError(form, err);
            }
          })}
        >
          <Field label="Courier" htmlFor="courier" error={e.courier?.message} required>
            <Input id="courier" list="couriers" {...form.register('courier')} />
            <datalist id="couriers">
              {['Delhivery', 'Blue Dart', 'Ecom Express', 'XpressBees', 'DTDC', 'India Post'].map(
                (c) => (
                  <option key={c} value={c} />
                ),
              )}
            </datalist>
          </Field>
          <Field label="Tracking / AWB number" htmlFor="awb" error={e.trackingId?.message} required>
            <Input id="awb" {...form.register('trackingId')} />
          </Field>
          <Field label="Tracking URL (optional)" htmlFor="turl" error={e.trackingUrl?.message}>
            <Input id="turl" placeholder="https://" {...form.register('trackingUrl')} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            <Truck /> Confirm shipment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SellerOrderDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: o, isLoading } = useQuery({
    queryKey: ['seller-order', id],
    queryFn: () => api.seller.orders.get(id),
  });
  const [ship, setShip] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['seller-order', id] });
    void qc.invalidateQueries({ queryKey: ['table', 'seller-orders'] });
  };
  const step = async (name: 'accept' | 'pack' | 'deliver', ok: string) => {
    setBusy(name);
    try {
      await api.seller.orders[name](id);
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  if (isLoading || !o) return <Skeleton className="h-96" />;
  const a = o.shippingAddress;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/seller/orders">
          <ArrowLeft /> All orders
        </Link>
      </Button>
      <PageHeader
        title={o.subOrderNumber}
        description={`Placed ${formatDateTime(o.createdAt)} · ${o.paymentMethod === 'COD' ? 'Cash on Delivery — collect ' + formatINR(o.total, true) : 'Prepaid'}`}
        actions={
          <>
            <StatusBadge status={o.status} />
            {['ACCEPTED', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(o.status) && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    downloadBlob(
                      await api.seller.orders.label(id),
                      `label-${o.subOrderNumber}.pdf`,
                    );
                  } catch (e) {
                    toast.error(errMsg(e));
                  }
                }}
              >
                <Printer /> Label & packing slip
              </Button>
            )}
          </>
        }
      />

      <div
        className="mb-6 flex flex-wrap gap-3 rounded-2xl border bg-card p-4 shadow-soft"
        data-testid="order-actions"
      >
        {o.status === 'PENDING' && (
          <Button loading={busy === 'accept'} onClick={() => step('accept', 'Order accepted')}>
            <Check /> Accept order
          </Button>
        )}
        {o.status === 'ACCEPTED' && (
          <Button loading={busy === 'pack'} onClick={() => step('pack', 'Marked as packed')}>
            <PackageCheck /> Mark packed
          </Button>
        )}
        {o.status === 'PACKED' && (
          <Button onClick={() => setShip(true)}>
            <Truck /> Ship order
          </Button>
        )}
        {o.status === 'SHIPPED' && (
          <Button
            variant="success"
            loading={busy === 'deliver'}
            onClick={() => step('deliver', 'Marked as delivered')}
          >
            <Check /> Mark delivered
          </Button>
        )}
        {['PENDING', 'ACCEPTED', 'PACKED'].includes(o.status) && (
          <Button variant="outline" className="text-destructive" onClick={() => setCancel(true)}>
            <X /> Cancel order
          </Button>
        )}
        {['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status) && (
          <p className="py-2 text-sm text-muted-foreground">
            No further actions — this order is {o.status.toLowerCase()}.
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      <Img src={i.image} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="line-clamp-1 font-semibold">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.variantName} · Qty {i.quantity} · GST {i.gstRate}%
                      </p>
                    </div>
                    <span className="font-bold tabular-nums">{formatINR(i.lineTotal, true)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Order value</dt>
                  <dd className="tabular-nums">{formatINR(o.total, true)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Commission ({o.commissionRate}%)</dt>
                  <dd className="tabular-nums text-destructive">
                    − {formatINR(o.commissionAmount, true)}
                  </dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <dt>Your earning</dt>
                  <dd className="tabular-nums text-success">{formatINR(o.sellerEarning, true)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline events={o.timeline} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" /> Ship to
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">{a.fullName}</p>
              <p>
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}
              </p>
              <p>
                {a.city}, {a.state} – {a.pincode}
              </p>
              <p>Phone: {a.phone}</p>
            </CardContent>
          </Card>
          {o.trackingId && (
            <Card>
              <CardHeader>
                <CardTitle>Shipment</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  <b>{o.courier}</b>
                </p>
                <p className="font-mono">{o.trackingId}</p>
                {o.trackingUrl && (
                  <a
                    href={o.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    Open tracking
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {ship && <ShipDialog id={id} open onOpenChange={setShip} onDone={refresh} />}
      <ReasonDialog
        open={cancel}
        onOpenChange={setCancel}
        title="Cancel this order?"
        description="Stock is returned and prepaid orders are refunded to the customer."
        confirmLabel="Cancel order"
        destructive
        label="Reason"
        onConfirm={async (reason) => {
          await api.seller.orders.cancel(id, reason);
          toast.success('Order cancelled');
          refresh();
        }}
      />
    </>
  );
}
