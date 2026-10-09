'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Minus, Plus, ShoppingCart, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CartItemDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { errMsg } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Badge, EmptyState, Skeleton } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Img } from '@/components/ui/img';
import { Price } from './price';
import { PriceSummary } from './price-summary';

function CartLine({ item }: { item: CartItemDto }) {
  const setQty = hooks.useSetCartQuantity();
  const remove = hooks.useRemoveFromCart();
  const save = hooks.useSaveForLater();
  const blocked = Boolean(item.issue);
  return (
    <li
      className={cn('flex gap-4 border-b p-4 last:border-0 sm:p-5', blocked && 'bg-destructive/5')}
      data-testid="cart-line"
    >
      <Link
        href={`/products/${item.slug}`}
        className="relative size-24 shrink-0 overflow-hidden rounded-xl border bg-muted sm:size-28"
      >
        <Img src={item.image} alt={item.name} fill sizes="112px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/products/${item.slug}`}
              className="line-clamp-2 font-semibold hover:text-primary"
            >
              {item.name}
            </Link>
            {item.variantName && item.variantName !== 'Default' && (
              <p className="mt-0.5 text-sm text-muted-foreground">{item.variantName}</p>
            )}
            <p className="text-xs text-muted-foreground">Sold by {item.seller.storeName}</p>
          </div>
          <div className="text-right">
            <Price price={item.price * item.quantity} size="md" className="justify-end" />
            {item.quantity > 1 && (
              <p className="text-xs text-muted-foreground">{formatINR(item.price)} each</p>
            )}
          </div>
        </div>
        {blocked && (
          <Badge variant="destructive" className="mt-2 normal-case tracking-normal">
            {item.issue}
          </Badge>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-lg border bg-card"
            role="group"
            aria-label={`Quantity for ${item.name}`}
          >
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={item.quantity <= 1 || setQty.isPending}
              onClick={() =>
                setQty.mutate(
                  { variantId: item.variantId, quantity: item.quantity - 1 },
                  { onError: (e) => toast.error(errMsg(e)) },
                )
              }
              className="grid size-9 place-content-center disabled:opacity-40"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-bold tabular-nums" data-testid="line-qty">
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={item.quantity >= item.maxQuantity || setQty.isPending}
              onClick={() =>
                setQty.mutate(
                  { variantId: item.variantId, quantity: item.quantity + 1 },
                  { onError: (e) => toast.error(errMsg(e)) },
                )
              }
              className="grid size-9 place-content-center disabled:opacity-40"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              save.mutate(item.variantId, { onSuccess: () => toast.success('Saved for later') })
            }
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"
          >
            <Bookmark className="size-4" /> Save for later
          </button>
          <button
            type="button"
            onClick={() =>
              remove.mutate(item.variantId, { onSuccess: () => toast.success('Removed from cart') })
            }
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" /> Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function SavedLine({ item }: { item: CartItemDto }) {
  const move = hooks.useMoveToCart();
  const remove = hooks.useRemoveFromCart();
  return (
    <li className="flex gap-3 rounded-2xl border bg-card p-3">
      <Link
        href={`/products/${item.slug}`}
        className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted"
      >
        <Img src={item.image} alt={item.name} fill sizes="80px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/products/${item.slug}`}
          className="line-clamp-2 text-sm font-semibold hover:text-primary"
        >
          {item.name}
        </Link>
        <p className="text-sm font-bold">{formatINR(item.price)}</p>
        <div className="mt-1 flex gap-3 text-xs font-semibold">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            disabled={item.stock === 0}
            onClick={() =>
              move.mutate(item.variantId, {
                onSuccess: () => toast.success('Moved to cart'),
                onError: (e) => toast.error(errMsg(e)),
              })
            }
          >
            {item.stock === 0 ? 'Out of stock' : 'Move to cart'}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => remove.mutate(item.variantId)}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function CouponBox({ applied }: { applied: { code: string; discount: number } | null }) {
  const status = useAuth((s) => s.status);
  const router = useRouter();
  const [code, setCode] = useState('');
  const apply = hooks.useApplyCoupon();
  const remove = hooks.useRemoveCoupon();
  const { data: offers } = hooks.useCoupons();

  const submit = (c: string) => {
    if (status !== 'authed') {
      toast.info('Sign in to apply a coupon');
      return router.push('/login?next=/cart');
    }
    apply.mutate(c, {
      onSuccess: () => {
        toast.success(`Coupon ${c.toUpperCase()} applied`);
        setCode('');
      },
      onError: (e) => toast.error(errMsg(e, 'Invalid coupon')),
    });
  };

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
        <Tag className="size-4 text-primary" /> Apply coupon
      </h2>
      {applied ? (
        <div className="flex items-center justify-between rounded-xl border border-success/40 bg-success/10 px-3 py-2.5">
          <div>
            <p className="text-sm font-extrabold tracking-wide text-success">{applied.code}</p>
            <p className="text-xs text-success/90">You save {formatINR(applied.discount, true)}</p>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove coupon"
            onClick={() => remove.mutate()}
          >
            <X />
          </Button>
        </div>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) submit(code.trim());
            }}
          >
            <Input
              aria-label="Coupon code"
              placeholder="Enter coupon code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="h-10 uppercase"
            />
            <Button type="submit" variant="secondary" className="h-10" loading={apply.isPending}>
              Apply
            </Button>
          </form>
          {offers && offers.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {offers.slice(0, 3).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0">
                    <b className="rounded bg-accent/25 px-1.5 py-0.5 font-mono">{o.code}</b>{' '}
                    <span className="text-muted-foreground">{o.description}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-bold text-primary hover:underline"
                    onClick={() => submit(o.code)}
                  >
                    Apply
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function CartView() {
  const { data: cart, isLoading } = hooks.useCart();
  const status = useAuth((s) => s.status);
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="mb-6 h-9 w-48" />
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  const empty = !cart || (cart.items.length === 0 && cart.saved.length === 0);
  if (empty) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<ShoppingCart />}
          title="Your cart is empty"
          description="Looks like you haven’t added anything yet. Explore deals and find something you love."
          action={
            <Button asChild size="lg">
              <Link href="/">Start shopping</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const hasIssues = cart.items.some((i) => i.issue);
  const goCheckout = () => {
    if (hasIssues) return toast.error('Please fix the highlighted items before checking out');
    router.push(status === 'authed' ? '/checkout' : '/login?next=/checkout');
  };

  return (
    <div className="container-page py-6 sm:py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold">
        Shopping cart{' '}
        <span className="text-lg font-semibold text-muted-foreground">
          ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
        </span>
      </h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          {cart.items.length > 0 && (
            <ul className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              {cart.items.map((i) => (
                <CartLine key={i.variantId} item={i} />
              ))}
            </ul>
          )}
          {cart.items.length === 0 && (
            <EmptyState
              title="Nothing in your cart right now"
              description="Move something from “Saved for later” to continue."
            />
          )}
          {cart.saved.length > 0 && (
            <section aria-labelledby="saved-h">
              <h2 id="saved-h" className="mb-3 font-display text-lg font-bold">
                Saved for later ({cart.saved.length})
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {cart.saved.map((i) => (
                  <SavedLine key={i.variantId} item={i} />
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-36">
          <CouponBox applied={cart.coupon} />
          {cart.couponMessage && (
            <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs font-medium">
              Coupon removed: {cart.couponMessage}
            </p>
          )}
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="mb-4 font-display text-base font-bold">Price details</h2>
            <PriceSummary pricing={cart.pricing} itemCount={cart.itemCount} />
            <Button
              size="lg"
              className="mt-5 w-full"
              onClick={goCheckout}
              disabled={cart.items.length === 0}
            >
              Proceed to checkout
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Safe & secure payments · Easy returns
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
