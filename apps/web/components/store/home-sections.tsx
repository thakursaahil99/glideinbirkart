'use client';

import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CategoryDto, ProductSummary } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { viewedProducts } from '@/lib/recent';
import { Img } from '@/components/ui/img';
import { hasBakedText } from '@/components/store/hero-carousel';
import { Countdown } from './countdown';
import { ProductRail } from './product-rail';

export function CategoryTiles({ categories }: { categories: CategoryDto[] }) {
  return (
    <section aria-label="Shop by category">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">Browse</p>
          <h2 className="section-title">Shop by category</h2>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-8">
        {categories.map((c, i) => (
          <motion.li
            key={c.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
          >
            <Link
              href={`/c/${c.slug}`}
              className="group relative block overflow-hidden rounded-2xl bg-muted shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift"
            >
              <div className="relative aspect-[4/3]">
                <Img
                  src={c.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width:1280px) 12vw, (min-width:640px) 25vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <h3 className="font-display text-sm font-bold leading-tight text-white sm:text-[15px]">
                  {c.name}
                </h3>
                {typeof c.productCount === 'number' && (
                  <p className="text-[11px] font-medium text-white/75">{c.productCount} products</p>
                )}
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

export function DealsBand({ endsAt, products }: { endsAt: string; products: ProductSummary[] }) {
  if (products.length === 0) return null;
  return (
    <section
      aria-label="Deals of the day"
      className="relative overflow-hidden rounded-[2rem] bg-foreground px-4 py-8 sm:px-8 sm:py-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-primary/40 blur-3xl"
      />
      <div className="relative mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-accent-foreground">
            <Zap className="size-3.5" fill="currentColor" /> Today only
          </p>
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
            Deals of the Day
          </h2>
          <p className="mt-1 text-sm text-white/60">
            Fresh picks every midnight — grab them before the clock runs out.
          </p>
        </div>
        <Countdown endsAt={endsAt} />
      </div>
      <ProductRail
        title="Up to 70% off"
        products={products}
        href="/search?sort=discount"
        tone="dark"
        className="relative"
      />
    </section>
  );
}

/** Personalised rails: shown after the auth state is known. */
export function RecentlyViewedRail() {
  const status = useAuth((s) => s.status);
  const [guestIds, setGuestIds] = useState<string[]>([]);
  useEffect(() => setGuestIds(viewedProducts.get()), []);
  const server = hooks.useRecentlyViewed({ enabled: status === 'authed' });
  const guest = useQuery({
    queryKey: ['viewed-guest', guestIds],
    queryFn: () => api.products.byIds(guestIds),
    enabled: status === 'guest' && guestIds.length > 0,
  });
  const products = status === 'authed' ? server.data : guest.data;
  return (
    <ProductRail
      title="Recently viewed"
      eyebrow="Pick up where you left off"
      products={products}
      className="empty:hidden"
    />
  );
}

export function RecommendedRail() {
  const status = useAuth((s) => s.status);
  const [viewed, setViewed] = useState<string[] | undefined>();
  useEffect(() => setViewed(viewedProducts.get()), []);
  const { data, isLoading } = hooks.useRecommended(status === 'authed' ? undefined : viewed, {
    enabled: status !== 'loading' && viewed !== undefined,
  });
  return (
    <ProductRail
      title="Recommended for you"
      eyebrow="Based on what you like"
      products={data}
      loading={isLoading}
    />
  );
}

export function PromoBanners({
  banners,
}: {
  banners: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string;
    linkUrl: string | null;
  }>;
}) {
  if (banners.length === 0) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {banners.map((b) => (
        <li key={b.id}>
          <Link
            href={b.linkUrl ?? '/search'}
            className="group relative block aspect-[20/9] overflow-hidden rounded-3xl shadow-soft transition hover:shadow-lift"
          >
            <Img
              src={b.imageUrl}
              alt={`${b.title}. ${b.subtitle ?? ''}`}
              fill
              sizes="(min-width:640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {!hasBakedText(b.imageUrl) && (
              <>
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent"
                />
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 flex max-w-[75%] flex-col justify-center gap-1 px-5 text-white"
                >
                  <span className="text-lg font-bold leading-tight sm:text-2xl">{b.title}</span>
                  {b.subtitle && (
                    <span className="line-clamp-2 text-xs text-white/90 sm:text-sm">
                      {b.subtitle}
                    </span>
                  )}
                </span>
              </>
            )}
            <span className="absolute bottom-3 right-3 grid size-9 place-content-center rounded-full bg-card/90 opacity-0 shadow transition group-hover:opacity-100">
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
