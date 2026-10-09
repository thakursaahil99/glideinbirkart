'use client';

import Link from 'next/link';
import { Plus, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductDetail } from '@gk/types';
import { formatINR } from '@gk/utils';
import { hooks } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Img } from '@/components/ui/img';
import { ProductRail } from './product-rail';

/** "Frequently bought together" bundle with a one-click add for all items. */
export function FrequentlyBought({ product }: { product: ProductDetail }) {
  const { data } = hooks.useFrequentlyBought(product.id);
  const add = hooks.useAddToCart();
  const items = (data ?? [])
    .filter((p) => p.id !== product.id && p.inStock && p.defaultVariantId && !p.hasVariants)
    .slice(0, 2);
  if (items.length === 0 || !product.defaultVariantId) return null;
  const bundle = [
    {
      id: product.id,
      name: product.name,
      image: product.image,
      price: product.price,
      variantId: product.defaultVariantId,
      slug: product.slug,
      hasVariants: product.hasVariants,
    },
    ...items.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      price: p.price,
      variantId: p.defaultVariantId as string,
      slug: p.slug,
      hasVariants: p.hasVariants,
    })),
  ];
  const total = bundle.reduce((n, b) => n + b.price, 0);
  const addAll = async () => {
    try {
      for (const b of bundle)
        if (!b.hasVariants) await add.mutateAsync({ variantId: b.variantId, quantity: 1 });
      toast.success(`${bundle.length} items added to cart`, {
        action: { label: 'View cart', onClick: () => (window.location.href = '/cart') },
      });
    } catch {
      toast.error('Some items could not be added');
    }
  };
  return (
    <section aria-labelledby="fbt-h" className="rounded-3xl border bg-card p-5 shadow-soft sm:p-7">
      <h2 id="fbt-h" className="section-title mb-5">
        Frequently bought together
      </h2>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <ul className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3">
          {bundle.map((b, i) => (
            <li key={b.id} className="flex items-center gap-2 sm:gap-3">
              {i > 0 && <Plus className="size-5 text-muted-foreground" aria-hidden />}
              <Link href={`/products/${b.slug}`} className="block w-28 sm:w-36">
                <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted">
                  <Img src={b.image} alt={b.name} fill sizes="144px" className="object-cover" />
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium">{b.name}</p>
                <p className="text-sm font-bold">{formatINR(b.price)}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-secondary/60 p-5 text-center lg:w-64">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total for {bundle.length} items
          </p>
          <p className="my-1 font-display text-3xl font-extrabold">{formatINR(total)}</p>
          <Button className="w-full" onClick={addAll} loading={add.isPending}>
            <ShoppingBag /> Add all to cart
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SimilarProducts({ productId }: { productId: string }) {
  const { data, isLoading } = hooks.useSimilar(productId);
  return (
    <ProductRail
      title="Similar products"
      eyebrow="You may also like"
      products={data}
      loading={isLoading}
    />
  );
}
