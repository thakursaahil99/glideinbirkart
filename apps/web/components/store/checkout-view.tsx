'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Check,
  CreditCard,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AddressDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { hooks } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Badge, EmptyState, Skeleton } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { Img } from '@/components/ui/img';
import { AddressDialog } from './address-form';
import { usePayOrder } from './payment';
import { PriceSummary } from './price-summary';

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6"
      aria-labelledby={`step-${n}`}
    >
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-3 font-display text-lg font-bold">
        <span
          className={cn(
            'grid size-7 place-content-center rounded-full text-sm font-extrabold',
            done ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground',
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const { data: cart, isLoading: cartLoading } = hooks.useCart();
  const { data: addresses, isLoading: addrLoading } = hooks.useAddresses();
  const { data: settings, isLoading: settingsLoading } = hooks.useSettings();
  const checkout = hooks.useCheckout();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<'RAZORPAY' | 'COD'>('RAZORPAY');
  const [notes, setNotes] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; address: AddressDto | null }>({
    open: false,
    address: null,
  });

  useEffect(() => {
    if (!addressId && addresses?.length)
      setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0])!.id);
  }, [addresses, addressId]);

  const selected = addresses?.find((a) => a.id === addressId);
  const { data: pin } = hooks.usePincode(selected?.pincode ?? '');
  const total = cart?.pricing.total ?? 0;
  // Cash-only store: the admin can switch online payment off, then COD is the only option.
  const onlineEnabled = settings?.onlinePaymentsEnabled !== false;
  const codAllowed =
    Boolean(settings?.codEnabled) &&
    pin?.codAvailable !== false &&
    (!onlineEnabled || total <= (settings?.codMaxAmount ?? Infinity));
  useEffect(() => {
    if (settingsLoading) return;
    if (!onlineEnabled && method === 'RAZORPAY') setMethod('COD');
    else if (onlineEnabled && !codAllowed && method === 'COD') setMethod('RAZORPAY');
  }, [settingsLoading, onlineEnabled, codAllowed, method]);

  const { startPayment, MockDialog } = usePayOrder({
    onPaid: (order) => router.replace(`/order-confirmation/${order.id}`),
    onFailed: (orderId) => {
      toast.error('Payment not completed. You can retry from your order page.');
      router.replace(`/order-confirmation/${orderId}`);
    },
  });

  if (cartLoading || addrLoading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="mb-6 h-9 w-56" />
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-4">
            <Skeleton className="h-56" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Your cart is empty"
          description="Add something to your cart to check out."
          action={
            <Button asChild>
              <Link href="/">Continue shopping</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const unserviceable = pin && !pin.serviceable;
  const issues = cart.items.filter((i) => i.issue);

  const place = () => {
    if (!addressId) return toast.error('Select a delivery address');
    checkout.mutate(
      { addressId, paymentMethod: method, notes: notes || undefined },
      {
        onSuccess: (res) => {
          if (method === 'COD') router.replace(`/order-confirmation/${res.order.id}`);
          else void startPayment(res);
        },
        onError: (e) => {
          toast.error(errMsg(e, 'Could not place your order'));
          if (method === 'RAZORPAY' && /ONLINE_PAYMENT_DISABLED/.test(JSON.stringify(e)))
            setMethod('COD');
        },
      },
    );
  };

  return (
    <div className="container-page py-6 sm:py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold">Checkout</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <Step n={1} title="Delivery address" done={!!selected}>
            {addresses && addresses.length > 0 ? (
              <ul
                className="grid gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Delivery address"
              >
                {addresses.map((a) => (
                  <li key={a.id}>
                    <label
                      className={cn(
                        'relative flex h-full cursor-pointer flex-col gap-1 rounded-xl border p-4 text-sm transition-all hover:border-primary',
                        addressId === a.id && 'border-primary bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <input
                        type="radio"
                        name="address"
                        className="sr-only"
                        checked={addressId === a.id}
                        onChange={() => setAddressId(a.id)}
                      />
                      <span className="flex items-center gap-2 font-bold">
                        {a.fullName} <Badge variant="secondary">{a.type}</Badge>
                        {a.isDefault && <Badge variant="accent">Default</Badge>}
                      </span>
                      <span className="text-muted-foreground">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}
                        {a.landmark ? `, ${a.landmark}` : ''}
                      </span>
                      <span className="text-muted-foreground">
                        {a.city}, {a.state} – <b className="text-foreground">{a.pincode}</b>
                      </span>
                      <span className="text-muted-foreground">Phone: {a.phone}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setDialog({ open: true, address: a });
                        }}
                        className="mt-1 inline-flex items-center gap-1 self-start text-xs font-bold text-primary hover:underline"
                      >
                        <Pencil className="size-3" /> Edit
                      </button>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<MapPin />}
                title="No saved addresses"
                description="Add a delivery address to continue."
                className="py-8"
              />
            )}
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setDialog({ open: true, address: null })}
            >
              <Plus /> Add a new address
            </Button>
            {unserviceable && (
              <p
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                <TriangleAlert className="size-4" /> {pin.message}
              </p>
            )}
            {pin?.serviceable && <p className="mt-3 text-sm text-success">✓ {pin.message}</p>}
          </Step>

          <Step n={2} title="Payment method" done={!!method}>
            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Payment method"
            >
              {onlineEnabled && (
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all hover:border-primary',
                    method === 'RAZORPAY' && 'border-primary bg-primary/5 ring-1 ring-primary',
                  )}
                >
                  <input
                    type="radio"
                    name="pay"
                    className="sr-only"
                    checked={method === 'RAZORPAY'}
                    onChange={() => setMethod('RAZORPAY')}
                  />
                  <CreditCard className="mt-0.5 size-5 text-primary" />
                  <span>
                    <b className="block text-sm">Pay online</b>
                    <span className="text-xs text-muted-foreground">
                      UPI, cards, netbanking & wallets via Razorpay
                    </span>
                  </span>
                </label>
              )}
              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 transition-all',
                  codAllowed
                    ? 'cursor-pointer hover:border-primary'
                    : 'cursor-not-allowed opacity-55',
                  method === 'COD' && 'border-primary bg-primary/5 ring-1 ring-primary',
                )}
              >
                <input
                  type="radio"
                  name="pay"
                  className="sr-only"
                  checked={method === 'COD'}
                  disabled={!codAllowed}
                  onChange={() => setMethod('COD')}
                />
                <Banknote className="mt-0.5 size-5 text-primary" />
                <span>
                  <b className="block text-sm">Cash on Delivery</b>
                  <span className="text-xs text-muted-foreground">
                    {codAllowed
                      ? 'Pay when your order arrives'
                      : pin?.codAvailable === false
                        ? 'Not available for this PIN code'
                        : `Available up to ${formatINR(settings?.codMaxAmount ?? 0)}`}
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-4">
              <label htmlFor="notes" className="mb-1.5 block text-[13px] font-semibold">
                Delivery instructions (optional)
              </label>
              <Textarea
                id="notes"
                rows={2}
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Leave with the security guard"
                className="min-h-[64px]"
              />
            </div>
          </Step>

          <Step n={3} title={`Review items (${cart.itemCount})`}>
            <ul className="divide-y">
              {cart.items.map((i) => (
                <li key={i.variantId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    <Img src={i.image} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="line-clamp-1 font-semibold">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.variantName && i.variantName !== 'Default' ? `${i.variantName} · ` : ''}Qty{' '}
                      {i.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-bold">{formatINR(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/cart"
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Edit cart
            </Link>
          </Step>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-36">
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="mb-4 font-display text-base font-bold">Order summary</h2>
            <PriceSummary pricing={cart.pricing} itemCount={cart.itemCount} />
            {cart.coupon && (
              <p className="mt-3 text-xs text-muted-foreground">
                Coupon <b>{cart.coupon.code}</b> applied ·{' '}
                <Link href="/cart" className="font-semibold text-primary hover:underline">
                  change
                </Link>
              </p>
            )}
            {issues.length > 0 && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs font-medium text-destructive"
              >
                {issues[0]!.name}: {issues[0]!.issue}.{' '}
                <Link href="/cart" className="underline">
                  Fix in cart
                </Link>
              </p>
            )}
            <Button
              size="lg"
              className="mt-5 w-full"
              onClick={place}
              loading={checkout.isPending}
              disabled={!selected || unserviceable || issues.length > 0 || settingsLoading}
              data-testid="place-order"
            >
              {method === 'COD' ? 'Place order' : `Pay ${formatINR(total, true)}`}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> 100% secure payments
            </p>
          </div>
        </aside>
      </div>

      {dialog.open && (
        <AddressDialog
          key={dialog.address?.id ?? 'new'}
          open
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          address={dialog.address}
          onSaved={(a) => setAddressId(a.id)}
        />
      )}
      {MockDialog}
    </div>
  );
}
