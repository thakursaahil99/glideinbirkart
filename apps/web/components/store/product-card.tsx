'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductSummary } from '@gk/types';
import { hooks } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/data';
import { Img } from '@/components/ui/img';
import { Button } from '@/components/ui/button';
import { Price, RatingPill } from './price';
import { WishlistButton } from './wishlist-button';
import { ApiError } from '@gk/api-client';

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductSummary;
  priority?: boolean;
  className?: string;
}) {
  const add = hooks.useAddToCart();
  const href = `/products/${product.slug}`;

  const quickAdd = () => {
    if (!product.defaultVariantId) return;
    add.mutate(
      { variantId: product.defaultVariantId, quantity: 1 },
      {
        onSuccess: () =>
          toast.success('Added to cart', {
            description: product.name,
            action: { label: 'View cart', onClick: () => (window.location.href = '/cart') },
          }),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not add to cart'),
      },
    );
  };

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        className,
      )}
    >
      <Link
        href={href}
        className="relative block aspect-square overflow-hidden bg-muted"
        aria-label={product.name}
      >
        <Img
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width:1280px) 20vw, (min-width:768px) 28vw, 48vw"
          priority={priority}
          className={cn(
            'object-cover transition-transform duration-500 group-hover:scale-105',
            !product.inStock && 'opacity-60 grayscale',
          )}
        />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {product.discountPercent >= 10 && product.inStock && (
            <Badge variant="deal">{product.discountPercent}% off</Badge>
          )}
          {!product.inStock && <Badge variant="muted">Sold out</Badge>}
          {product.inStock && product.lowStock && <Badge variant="warning">Few left</Badge>}
        </div>
      </Link>
      <WishlistButton productId={product.id} className="absolute right-2.5 top-2.5" />

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        {product.brand && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {product.brand.name}
          </p>
        )}
        <h3 className="line-clamp-2 min-h-[2.5rem] font-sans text-sm font-semibold leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:z-0 hover:text-primary">
            {product.name}
          </Link>
        </h3>
        <RatingPill value={product.ratingAvg} count={product.ratingCount} className="self-start" />
        <Price
          price={product.price}
          mrp={product.mrp}
          discountPercent={product.discountPercent}
          size="md"
          className="mt-auto pt-1"
        />
        <div className="relative z-10 mt-2">
          {product.inStock ? (
            product.hasVariants ? (
              <Button asChild variant="secondary" size="sm" className="w-full">
                <Link href={href}>Select options</Link>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={quickAdd}
                loading={add.isPending}
              >
                <ShoppingBag /> Add to cart
              </Button>
            )
          ) : (
            <Button size="sm" variant="outline" className="w-full" disabled>
              Out of stock
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-2.5 p-3.5">
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-6 w-1/2" />
        <div className="skeleton h-8 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function ProductGrid({
  products,
  className,
}: {
  products: ProductSummary[];
  className?: string;
}) {
  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4', className)}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
