'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Star, X } from 'lucide-react';
import type { ProductFacets } from '@gk/types';
import { formatINR } from '@gk/utils';
import { cn, withParams } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/data';
import { CheckRow, Input, Select } from '@/components/ui/form';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/overlay';

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest First' },
  { value: 'rating', label: 'Customer Rating' },
  { value: 'discount', label: 'Biggest Discount' },
];

/** All filter state lives in the URL → shareable, back-button friendly, and server-rendered for SEO. */
function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const push = (patch: Record<string, string | number | null | undefined>) => {
    const next = withParams(params, { page: null, ...patch });
    start(() => router.push(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false }));
  };
  const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? [];
  const toggle = (key: string, value: string) => {
    const cur = list(key);
    push({
      [key]:
        (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]).join(',') || null,
    });
  };
  return { params, push, list, toggle, pending };
}

export function SortSelect() {
  const { params, push } = useUrlState();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden whitespace-nowrap font-medium text-muted-foreground sm:inline">
        Sort by
      </span>
      <Select
        aria-label="Sort products"
        value={params.get('sort') ?? 'relevance'}
        onChange={(e) => push({ sort: e.target.value === 'relevance' ? null : e.target.value })}
        wrapperClassName="w-auto min-w-[11.5rem]"
        className="h-10 rounded-full bg-card text-[13px] font-semibold"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b py-4 first:pt-0 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between font-display text-sm font-bold">
        {title}
        <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 space-y-2.5">{children}</div>
    </details>
  );
}

function PriceRange({ range }: { range: { min: number; max: number } }) {
  const { params, push } = useUrlState();
  const [min, setMin] = useState(params.get('minPrice') ?? '');
  const [max, setMax] = useState(params.get('maxPrice') ?? '');
  useEffect(() => {
    setMin(params.get('minPrice') ?? '');
    setMax(params.get('maxPrice') ?? '');
  }, [params]);
  const apply = () => push({ minPrice: min || null, maxPrice: max || null });
  const buckets = [
    { label: 'Under ₹500', max: 500 },
    { label: '₹500 – ₹1,500', min: 500, max: 1500 },
    { label: '₹1,500 – ₹5,000', min: 1500, max: 5000 },
    { label: '₹5,000 – ₹20,000', min: 5000, max: 20000 },
    { label: 'Above ₹20,000', min: 20000 },
  ];
  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Minimum price"
          inputMode="numeric"
          placeholder={`₹${range.min}`}
          value={min}
          onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="h-9 text-[13px]"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          aria-label="Maximum price"
          inputMode="numeric"
          placeholder={`₹${range.max}`}
          value={max}
          onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="h-9 text-[13px]"
        />
        <Button size="sm" variant="secondary" onClick={apply}>
          Go
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {buckets.map((b) => {
          const active =
            params.get('minPrice') === String(b.min ?? '') &&
            params.get('maxPrice') === String(b.max ?? '');
          return (
            <button
              key={b.label}
              type="button"
              onClick={() =>
                push({
                  minPrice: active ? null : (b.min ?? null),
                  maxPrice: active ? null : (b.max ?? null),
                })
              }
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary',
                active && 'border-primary bg-primary/10 text-primary',
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function FilterPanel({
  facets,
  categoryBase,
}: {
  facets?: ProductFacets;
  categoryBase?: { slug: string; name: string };
}) {
  const { params, push, list, toggle } = useUrlState();
  if (!facets) return null;
  return (
    <div>
      {facets.categories.length > 0 && (
        <Section title={categoryBase ? 'Sub-categories' : 'Categories'}>
          <ul className="space-y-1.5">
            {facets.categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}${params.get('q') ? `?q=${encodeURIComponent(params.get('q') as string)}` : ''}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-muted"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Price">
        <PriceRange range={facets.priceRange} />
      </Section>
      {facets.brands.length > 0 && (
        <Section title="Brand">
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <div key={b.id} className="flex items-center justify-between">
                <CheckRow
                  id={`brand-${b.slug}`}
                  checked={list('brand').includes(b.slug)}
                  onCheckedChange={() => toggle('brand', b.slug)}
                >
                  {b.name}
                </CheckRow>
                <span className="text-xs text-muted-foreground">{b.count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {facets.attributes.map((a) => (
        <Section key={a.key} title={a.label}>
          {a.type === 'COLOR' ? (
            <div className="flex flex-wrap gap-2">
              {a.values.map((v) => {
                const on = list(`attr_${a.key}`).includes(v.value);
                return (
                  <button
                    key={v.value}
                    type="button"
                    title={`${v.value} (${v.count})`}
                    aria-label={`${v.value}, ${v.count} products`}
                    aria-pressed={on}
                    onClick={() => toggle(`attr_${a.key}`, v.value)}
                    className={cn(
                      'size-8 rounded-full border-2 border-transparent ring-1 ring-border transition-transform hover:scale-110',
                      on && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    )}
                    style={{ background: v.hex ?? '#ccc' }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {a.values.map((v) => (
                <div key={v.value} className="flex items-center justify-between">
                  <CheckRow
                    id={`${a.key}-${v.value}`}
                    checked={list(`attr_${a.key}`).includes(v.value)}
                    onCheckedChange={() => toggle(`attr_${a.key}`, v.value)}
                  >
                    {v.value}
                  </CheckRow>
                  <span className="text-xs text-muted-foreground">{v.count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      ))}
      <Section title="Customer rating">
        {[4, 3, 2].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => push({ rating: params.get('rating') === String(r) ? null : r })}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted',
              params.get('rating') === String(r) && 'bg-primary/10 font-semibold text-primary',
            )}
          >
            <span className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn('size-3.5', i < r ? 'text-accent' : 'text-border')}
                  fill="currentColor"
                  strokeWidth={0}
                />
              ))}
            </span>
            & up
          </button>
        ))}
      </Section>
      <Section title="Discount">
        {[10, 25, 50, 70].map((d) => (
          <CheckRow
            key={d}
            id={`disc-${d}`}
            checked={params.get('discount') === String(d)}
            onCheckedChange={(v) => push({ discount: v ? d : null })}
          >
            {d}% or more
          </CheckRow>
        ))}
      </Section>
      <Section title="Availability">
        <CheckRow
          id="in-stock"
          checked={params.get('inStock') === 'true'}
          onCheckedChange={(v) => push({ inStock: v ? 'true' : null })}
        >
          Exclude out of stock
        </CheckRow>
      </Section>
      {facets.sellers.length > 1 && (
        <Section title="Seller">
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {facets.sellers.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <CheckRow
                  id={`seller-${s.id}`}
                  checked={list('seller').includes(s.id)}
                  onCheckedChange={() => toggle('seller', s.id)}
                >
                  {s.storeName}
                </CheckRow>
                <span className="text-xs text-muted-foreground">{s.count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

const CHIP_LABELS: Record<string, (v: string) => string> = {
  minPrice: (v) => `Min ${formatINR(Number(v))}`,
  maxPrice: (v) => `Max ${formatINR(Number(v))}`,
  rating: (v) => `${v}★ & up`,
  discount: (v) => `${v}%+ off`,
  inStock: () => 'In stock',
};

export function ActiveFilters({ facets }: { facets?: ProductFacets }) {
  const { params, push, list } = useUrlState();
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  for (const [k, fn] of Object.entries(CHIP_LABELS)) {
    const v = params.get(k);
    if (v) chips.push({ key: k, label: fn(v), remove: () => push({ [k]: null }) });
  }
  for (const slug of list('brand')) {
    const name = facets?.brands.find((b) => b.slug === slug)?.name ?? slug;
    chips.push({
      key: `brand-${slug}`,
      label: name,
      remove: () =>
        push({
          brand:
            list('brand')
              .filter((s) => s !== slug)
              .join(',') || null,
        }),
    });
  }
  for (const id of list('seller')) {
    const name = facets?.sellers.find((s) => s.id === id)?.storeName ?? 'Seller';
    chips.push({
      key: `seller-${id}`,
      label: name,
      remove: () =>
        push({
          seller:
            list('seller')
              .filter((s) => s !== id)
              .join(',') || null,
        }),
    });
  }
  for (const key of params.keys()) {
    if (!key.startsWith('attr_')) continue;
    for (const v of list(key))
      chips.push({
        key: `${key}-${v}`,
        label: `${facets?.attributes.find((a) => `attr_${a.key}` === key)?.label ?? key.slice(5)}: ${v}`,
        remove: () =>
          push({
            [key]:
              list(key)
                .filter((x) => x !== v)
                .join(',') || null,
          }),
      });
  }
  if (chips.length === 0) return null;
  const clearAll = () => {
    const keep: Record<string, null> = {};
    for (const key of [...params.keys()]) if (!['q', 'sort'].includes(key)) keep[key] = null;
    push(keep);
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((c) => (
        <Badge
          key={c.key}
          variant="secondary"
          className="gap-1 py-1 pl-3 pr-1.5 text-xs normal-case tracking-normal"
        >
          {c.label}
          <button
            type="button"
            onClick={c.remove}
            aria-label={`Remove filter ${c.label}`}
            className="grid size-4 place-content-center rounded-full hover:bg-primary/15"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="text-xs font-semibold text-primary hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}

export function MobileFilters({
  facets,
  categoryBase,
  count,
}: {
  facets?: ProductFacets;
  categoryBase?: { slug: string; name: string };
  count: number;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden">
          <SlidersHorizontal /> Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <SheetTitle>Filters</SheetTitle>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterPanel facets={facets} categoryBase={categoryBase} />
        </div>
        <div className="border-t p-4">
          <SheetTrigger asChild>
            <Button className="w-full" size="lg">
              Show {count} results
            </Button>
          </SheetTrigger>
        </div>
      </SheetContent>
    </Sheet>
  );
}
