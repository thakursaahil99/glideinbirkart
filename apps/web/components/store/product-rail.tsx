'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductSummary } from '@gk/types';
import { cn } from '@/lib/utils';
import { ProductCard, ProductCardSkeleton } from './product-card';

/** Horizontally scrolling product row with arrow controls (touch-scrollable on mobile). */
export function ProductRail({
  title,
  eyebrow,
  products,
  href,
  loading,
  className,
  tone = 'default',
  action,
}: {
  title: string;
  eyebrow?: string;
  products?: ProductSummary[];
  href?: string;
  loading?: boolean;
  className?: string;
  tone?: 'default' | 'dark';
  action?: React.ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: -1 | 1) =>
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: 'smooth' });
  if (!loading && (!products || products.length === 0)) return null;
  const dark = tone === 'dark';

  return (
    <section className={cn('relative', className)} aria-label={title}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p
              className={cn(
                'mb-1 text-xs font-bold uppercase tracking-[0.18em]',
                dark ? 'text-accent' : 'text-primary',
              )}
            >
              {eyebrow}
            </p>
          )}
          <h2 className={cn('section-title', dark && 'text-white')}>{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {action}
          {href && (
            <Link
              href={href}
              className={cn(
                'hidden items-center gap-1 text-sm font-semibold sm:flex',
                dark ? 'text-white/80 hover:text-white' : 'text-primary hover:underline',
              )}
            >
              View all <ArrowRight className="size-4" />
            </Link>
          )}
          <div className="hidden gap-1.5 lg:flex">
            {[-1, 1].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => scroll(d as -1 | 1)}
                aria-label={d < 0 ? 'Scroll left' : 'Scroll right'}
                className={cn(
                  'grid size-9 place-content-center rounded-full border transition-colors',
                  dark ? 'border-white/25 text-white hover:bg-white/10' : 'bg-card hover:bg-muted',
                )}
              >
                {d < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul
        ref={ref}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:px-0"
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="w-[46%] shrink-0 sm:w-[30%] lg:w-[19%]">
                <ProductCardSkeleton />
              </li>
            ))
          : products?.map((p, i) => (
              <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[19%]">
                <ProductCard product={p} priority={i < 3} />
              </li>
            ))}
      </ul>
    </section>
  );
}
