import Link from 'next/link';
import { Suspense } from 'react';
import { ChevronRight, PackageSearch, SearchX } from 'lucide-react';
import type { ProductFacets, ProductListMeta, ProductSummary } from '@gk/types';
import type { ProductListParams } from '@gk/api-client';
import { EmptyState } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/data';
import { ActiveFilters, FilterPanel, MobileFilters, SortSelect } from './filters';
import { Pagination } from './pagination';
import { ProductGrid } from './product-card';

export type RawSearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 24;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Translate the page's URL search params into an API query (and keep the raw map for pagination links). */
export function toListParams(
  sp: RawSearchParams,
  extra: Partial<ProductListParams> = {},
): ProductListParams {
  const q: ProductListParams = {
    page: Number(pick(sp.page)) > 0 ? Number(pick(sp.page)) : 1,
    limit: PAGE_SIZE,
    ...extra,
  };
  const s = (k: string) => pick(sp[k]);
  if (s('q')) q.q = s('q');
  if (s('brand')) q.brand = s('brand') as string;
  if (s('seller')) q.seller = s('seller') as string;
  if (s('minPrice')) q.minPrice = Number(s('minPrice'));
  if (s('maxPrice')) q.maxPrice = Number(s('maxPrice'));
  if (s('rating')) q.rating = Number(s('rating'));
  if (s('discount')) q.discount = Number(s('discount'));
  if (s('inStock') === 'true') q.inStock = true;
  if (s('sort')) q.sort = s('sort');
  for (const [k, v] of Object.entries(sp))
    if (k.startsWith('attr_') && pick(v)) q[k] = pick(v) as string;
  return q;
}

export function flatParams(sp: RawSearchParams): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, pick(v)]));
}

export function ListingSkeleton() {
  return (
    <div className="container-page py-6">
      <Skeleton className="mb-3 h-4 w-48" />
      <Skeleton className="mb-6 h-9 w-72" />
      <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ListingPage({
  title,
  description,
  breadcrumbs,
  items,
  meta,
  total,
  page,
  totalPages,
  basePath,
  rawParams,
  categoryBase,
  query,
}: {
  title: string;
  description?: string | null;
  breadcrumbs: Array<{ name: string; href?: string }>;
  items: ProductSummary[];
  meta: ProductListMeta;
  total: number;
  page: number;
  totalPages: number;
  basePath: string;
  rawParams: RawSearchParams;
  categoryBase?: { slug: string; name: string };
  query?: string;
}) {
  const facets: ProductFacets | undefined = meta.facets;
  return (
    <div className="container-page py-5 sm:py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          {breadcrumbs.map((b, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
              {b.href ? (
                <Link href={b.href} className="hover:text-primary hover:underline">
                  {b.name}
                </Link>
              ) : (
                <span aria-current="page" className="font-semibold text-foreground">
                  {b.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {total.toLocaleString('en-IN')} {total === 1 ? 'product' : 'products'}
            {description ? ` · ${description}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Suspense>
            <MobileFilters facets={facets} categoryBase={categoryBase} count={total} />
            <SortSelect />
          </Suspense>
        </div>
      </div>

      {meta.didYouMean && query && (
        <p className="mb-4 rounded-xl bg-accent/15 px-4 py-2.5 text-sm">
          Showing results for{' '}
          <Link
            href={`/search?q=${encodeURIComponent(meta.didYouMean)}`}
            className="font-bold text-primary underline underline-offset-2"
          >
            {meta.didYouMean}
          </Link>
          <span className="text-muted-foreground"> — searched for “{query}”</span>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-32 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-2xl border bg-card p-5 shadow-soft">
            <div className="mb-3 font-display text-base font-extrabold">Filters</div>
            <Suspense>
              <FilterPanel facets={facets} categoryBase={categoryBase} />
            </Suspense>
          </div>
        </aside>
        <section aria-label="Products">
          <Suspense>
            <ActiveFilters facets={facets} />
          </Suspense>
          {items.length === 0 ? (
            <EmptyState
              icon={query ? <SearchX /> : <PackageSearch />}
              title={query ? `No results for “${query}”` : 'No products match your filters'}
              description="Try removing a filter, checking the spelling, or browsing our categories."
              action={
                <Button asChild>
                  <Link href="/">Back to home</Link>
                </Button>
              }
            />
          ) : (
            <ProductGrid products={items} />
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath={basePath}
            params={flatParams(rawParams)}
          />
        </section>
      </div>
    </div>
  );
}
