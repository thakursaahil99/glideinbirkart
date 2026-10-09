'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ImageDto, ProductDetail, VariantDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { ApiError } from '@gk/api-client';
import { api, hooks } from '@/lib/api';
import { viewedProducts } from '@/lib/recent';
import { cn, formatDate } from '@/lib/utils';
import { Badge, Separator } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Price, RatingPill } from './price';
import { ProductGallery } from './product-gallery';
import { WishlistButton } from './wishlist-button';

function PincodeChecker() {
  const [pin, setPin] = useState('');
  const [submitted, setSubmitted] = useState('');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('gk_pincode');
      if (saved) {
        setPin(saved);
        setSubmitted(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const { data, isFetching } = hooks.usePincode(submitted);
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Truck className="size-4 text-primary" /> Delivery & services
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^[1-9][0-9]{5}$/.test(pin)) {
            setSubmitted(pin);
            try {
              window.localStorage.setItem('gk_pincode', pin);
            } catch {
              /* ignore */
            }
          } else toast.error('Enter a valid 6-digit PIN code');
        }}
      >
        <Input
          aria-label="Delivery PIN code"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter PIN code"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="h-10"
        />
        <Button type="submit" variant="outline" size="sm" className="h-10" loading={isFetching}>
          Check
        </Button>
      </form>
      {data && (
        <div
          role="status"
          className={cn(
            'mt-3 rounded-xl px-3 py-2 text-sm',
            data.serviceable ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
          )}
        >
          <p className="font-semibold">{data.message}</p>
          {data.serviceable && (
            <p className="mt-0.5 text-xs opacity-80">
              {data.codAvailable ? 'Cash on Delivery available' : 'Online payment only'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ProductView({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const add = hooks.useAddToCart();
  const [qty, setQty] = useState(1);

  const defaultVariant =
    product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const [sel, setSel] = useState<Record<string, string>>(defaultVariant?.attributes ?? {});

  const keys = product.options.map((o) => o.key);
  const variant: VariantDto | undefined = useMemo(
    () =>
      keys.length === 0
        ? product.variants[0]
        : product.variants.find((v) => keys.every((k) => v.attributes[k] === sel[k])),
    [keys, product.variants, sel],
  );

  // record the view once per page load (recently viewed, trending, seller analytics)
  useEffect(() => {
    viewedProducts.add(product.id);
    api.products.trackView(product.id).catch(() => undefined);
  }, [product.id]);

  useEffect(() => setQty(1), [variant?.id]);

  const pick = (key: string, value: string) => {
    const next = { ...sel, [key]: value };
    const exact = product.variants.find((v) => keys.every((k) => v.attributes[k] === next[k]));
    if (exact) return setSel(next);
    // that exact combination doesn't exist → jump to the closest in-stock variant that has the chosen value
    const withValue = product.variants.filter((v) => v.attributes[key] === value);
    const best = [...withValue].sort(
      (a, b) =>
        Number(b.inStock) - Number(a.inStock) ||
        keys.filter((k) => b.attributes[k] === sel[k]).length -
          keys.filter((k) => a.attributes[k] === sel[k]).length,
    )[0];
    if (best) setSel({ ...best.attributes });
  };

  const optionAvailable = (key: string, value: string) =>
    product.variants.some(
      (v) =>
        v.attributes[key] === value &&
        v.inStock &&
        keys.filter((k) => k !== key).every((k) => v.attributes[k] === sel[k]),
    );
  const optionExistsAtAll = (key: string, value: string) =>
    product.variants.some((v) => v.attributes[key] === value && v.inStock);

  // gallery: shared images first, then the selected colour's images
  const gallery: ImageDto[] = useMemo(() => {
    const colorKey = keys.find((k) => k === 'color');
    const matching = colorKey
      ? new Set(
          product.variants
            .filter((v) => v.attributes[colorKey] === sel[colorKey])
            .flatMap((v) => v.imageIds),
        )
      : new Set<string>();
    const variantImgs = product.images.filter((i) => matching.has(i.id));
    const shared = product.images.filter((i) => !i.variantId);
    const other = product.images.filter((i) => i.variantId && !matching.has(i.id));
    return variantImgs.length ? [...variantImgs, ...shared] : [...shared, ...other];
  }, [product.images, product.variants, sel, keys]);

  const maxQty = Math.min(variant?.stock ?? 0, 10);
  const price = variant?.price ?? product.price;
  const mrp = variant?.mrp ?? product.mrp;

  const addToCart = (thenCheckout = false) => {
    if (!variant || !variant.inStock) return;
    add.mutate(
      { variantId: variant.id, quantity: qty },
      {
        onSuccess: () => {
          if (thenCheckout) return router.push('/checkout');
          toast.success('Added to cart', {
            description: `${product.name}${variant.name !== 'Default' ? ` · ${variant.name}` : ''}`,
            action: { label: 'View cart', onClick: () => router.push('/cart') },
          });
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not add to cart'),
      },
    );
  };

  const eta =
    product.returnWindowDays > 0 && product.isReturnable
      ? `${product.returnWindowDays}-day easy returns`
      : 'Non-returnable';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
      <div className="lg:sticky lg:top-36 lg:self-start">
        <ProductGallery images={gallery} name={product.name} />
      </div>

      <div className="space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {product.brand && (
              <Link
                href={`/search?brand=${product.brand.slug}`}
                className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary hover:underline"
              >
                {product.brand.name}
              </Link>
            )}
            {product.discountPercent >= 20 && <Badge variant="deal">Great deal</Badge>}
          </div>
          <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-[2rem]">
            {product.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <RatingPill value={product.ratingAvg} count={product.ratingCount} />
            {product.ratingCount > 0 && (
              <a href="#reviews" className="text-sm font-medium text-primary hover:underline">
                {product.ratingCount} {product.ratingCount === 1 ? 'review' : 'reviews'}
              </a>
            )}
            {product.soldCount > 50 && (
              <span className="text-sm text-muted-foreground">
                {product.soldCount.toLocaleString('en-IN')}+ sold
              </span>
            )}
          </div>
        </header>

        <div className="rounded-2xl bg-secondary/60 p-4">
          <Price price={price} mrp={mrp} size="xl" showGst />
          {mrp > price && (
            <p className="mt-1 text-sm font-semibold text-success">
              You save {formatINR(mrp - price)} on this item
            </p>
          )}
        </div>

        {product.options.map((opt) => (
          <fieldset key={opt.key} className="space-y-2.5">
            <legend className="text-sm font-bold">
              {opt.label}: <span className="font-medium text-muted-foreground">{sel[opt.key]}</span>
            </legend>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={opt.label}>
              {opt.values.map((v) => {
                const on = sel[opt.key] === v.value;
                const available = optionAvailable(opt.key, v.value);
                const anywhere = optionExistsAtAll(opt.key, v.value);
                return opt.type === 'COLOR' && v.hex ? (
                  <button
                    key={v.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${v.value}${anywhere ? '' : ' (out of stock)'}`}
                    title={v.value}
                    onClick={() => pick(opt.key, v.value)}
                    className={cn(
                      'relative size-10 rounded-full ring-1 ring-border transition-all hover:scale-105',
                      on && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      !available && 'opacity-45',
                    )}
                    style={{ background: v.hex }}
                  >
                    {on && (
                      <Check
                        className="absolute inset-0 m-auto size-4"
                        style={{
                          color: ['#f9fafb', '#f1e9d8', '#d6c3a0', '#cbd5e1'].includes(v.hex)
                            ? '#111'
                            : '#fff',
                        }}
                      />
                    )}
                    {!anywhere && (
                      <span
                        className="absolute inset-0 m-auto h-px w-full rotate-45 bg-foreground/60"
                        aria-hidden
                      />
                    )}
                  </button>
                ) : (
                  <button
                    key={v.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(opt.key, v.value)}
                    className={cn(
                      'min-w-12 rounded-xl border px-4 py-2 text-sm font-semibold transition-all hover:border-primary',
                      on
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                        : 'bg-card',
                      !available && 'border-dashed text-muted-foreground',
                      !anywhere && 'line-through opacity-50',
                    )}
                  >
                    {v.value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
          {variant?.inStock ? (
            variant.stock <= 5 ? (
              <span className="text-warning-foreground">
                <span className="rounded-md bg-warning/20 px-2 py-0.5 text-[hsl(32_90%_32%)] dark:text-warning">
                  Only {variant.stock} left — order soon
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-success">
                <PackageCheck className="size-4" /> In stock
              </span>
            )
          ) : (
            <span className="text-destructive">
              {variant ? 'Currently out of stock' : 'This combination is unavailable'}
            </span>
          )}
          {variant && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              SKU {variant.sku}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-xl border bg-card"
            role="group"
            aria-label="Quantity"
          >
            <button
              type="button"
              className="grid size-11 place-content-center disabled:opacity-40"
              aria-label="Decrease quantity"
              disabled={qty <= 1}
              onClick={() => setQty((q) => q - 1)}
            >
              <Minus className="size-4" />
            </button>
            <span className="w-9 text-center font-bold tabular-nums" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              className="grid size-11 place-content-center disabled:opacity-40"
              aria-label="Increase quantity"
              disabled={qty >= maxQty}
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <Button
            size="lg"
            className="min-w-40 flex-1"
            onClick={() => addToCart(false)}
            disabled={!variant?.inStock}
            loading={add.isPending && !add.variables?.quantity}
          >
            <ShoppingBag /> Add to cart
          </Button>
          <Button
            size="lg"
            variant="accent"
            className="min-w-40 flex-1"
            onClick={() => addToCart(true)}
            disabled={!variant?.inStock}
          >
            <Zap /> Buy now
          </Button>
          <WishlistButton productId={product.id} label className="border bg-card shadow-none" />
        </div>

        <PincodeChecker />

        <ul className="grid gap-3 rounded-2xl border bg-card p-4 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2">
            <RotateCcw className="size-4 shrink-0 text-primary" /> {eta}
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-primary" /> Secure payments
          </li>
          <li className="flex items-center gap-2">
            <Truck className="size-4 shrink-0 text-primary" /> GST invoice included
          </li>
        </ul>

        <Link
          href={`/search?seller=${product.sellerInfo.id}`}
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary"
        >
          <span className="grid size-11 place-content-center rounded-xl bg-secondary text-primary">
            <Store className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Sold by</p>
            <p className="truncate font-bold">{product.sellerInfo.storeName}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {product.sellerInfo.ratingCount > 0 && (
              <p className="font-semibold text-foreground">
                {product.sellerInfo.ratingAvg.toFixed(1)} ★ seller rating
              </p>
            )}
            <p>Selling since {formatDate(product.sellerInfo.since)}</p>
          </div>
        </Link>
        <Separator className="lg:hidden" />
      </div>

      {/* mobile sticky purchase bar */}
      <div className="fixed inset-x-0 bottom-[3.75rem] z-30 flex items-center gap-3 border-t bg-background/95 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold leading-none">{formatINR(price)}</p>
          {mrp > price && (
            <p className="text-xs text-muted-foreground line-through">{formatINR(mrp)}</p>
          )}
        </div>
        <Button
          className="flex-1"
          onClick={() => addToCart(false)}
          disabled={!variant?.inStock}
          loading={add.isPending}
        >
          <ShoppingBag /> {variant?.inStock ? 'Add to cart' : 'Out of stock'}
        </Button>
      </div>
    </div>
  );
}
