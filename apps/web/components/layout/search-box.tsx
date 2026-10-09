'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, Flame, Layers, Search, Tag, X } from 'lucide-react';
import { formatINR } from '@gk/utils';
import { hooks } from '@/lib/api';
import { recentSearches } from '@/lib/recent';
import { cn } from '@/lib/utils';
import { Img } from '@/components/ui/img';

function useDebounced<T>(value: T, ms = 220) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface Row {
  key: string;
  label: string;
  href: string;
  kind: 'query' | 'recent' | 'popular' | 'category' | 'brand' | 'product';
  meta?: string;
  image?: string | null;
}

const ICON = {
  query: Search,
  recent: Clock,
  popular: Flame,
  category: Layers,
  brand: Tag,
  product: Search,
} as const;

/** Debounced autocomplete: products, categories, brands and popular queries; recent searches when empty. Fully keyboard operable (ARIA combobox). */
export function SearchBox({
  className,
  autoFocus,
  onNavigate,
}: {
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const debounced = useDebounced(q.trim());
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: suggestions } = hooks.useSuggest(debounced);
  const { data: popular } = hooks.usePopularSearches();

  useEffect(() => setRecent(recentSearches.get()), [open]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    recentSearches.add(t);
    setOpen(false);
    onNavigate?.();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const rows: Row[] = useMemo(() => {
    if (q.trim().length < 2) {
      return [
        ...recent.map((r): Row => ({
          key: `r-${r}`,
          label: r,
          href: `/search?q=${encodeURIComponent(r)}`,
          kind: 'recent',
        })),
        ...(popular ?? []).slice(0, 6).map((p): Row => ({
          key: `p-${p}`,
          label: p,
          href: `/search?q=${encodeURIComponent(p)}`,
          kind: 'popular',
        })),
      ];
    }
    const s = suggestions;
    if (!s) return [];
    return [
      ...s.queries.map((x): Row => ({
        key: `q-${x}`,
        label: x,
        href: `/search?q=${encodeURIComponent(x)}`,
        kind: 'query',
      })),
      ...s.categories.map((c): Row => ({
        key: `c-${c.id}`,
        label: c.name,
        href: `/c/${c.slug}`,
        kind: 'category',
        meta: 'Category',
      })),
      ...s.brands.map((b): Row => ({
        key: `b-${b.id}`,
        label: b.name,
        href: `/search?q=${encodeURIComponent(b.name)}`,
        kind: 'brand',
        meta: 'Brand',
      })),
      ...s.products.map((p): Row => ({
        key: `pr-${p.id}`,
        label: p.name,
        href: `/products/${p.slug}`,
        kind: 'product',
        meta: formatINR(p.price),
        image: p.image,
      })),
    ];
  }, [q, recent, popular, suggestions]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active];
      if (row) {
        setOpen(false);
        onNavigate?.();
        if (row.kind === 'query' || row.kind === 'recent' || row.kind === 'popular')
          recentSearches.add(row.label);
        router.push(row.href);
      } else go(q);
    }
  };

  const showPanel = open && rows.length > 0;

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="relative"
      >
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Search for products, brands and more"
          aria-label="Search products"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="h-11 w-full rounded-full border border-input bg-card pl-11 pr-20 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ('')}
            className="absolute right-[3.4rem] top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-1 top-1 h-9 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      {showPanel && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border bg-popover p-2 shadow-lift animate-in fade-in-0 zoom-in-95"
        >
          {q.trim().length < 2 && recent.length > 0 && (
            <li className="flex items-center justify-between px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Recent
              <button
                type="button"
                className="font-semibold normal-case text-primary hover:underline"
                onClick={() => {
                  recentSearches.clear();
                  setRecent([]);
                }}
              >
                Clear
              </button>
            </li>
          )}
          {rows.map((r, i) => {
            const Icon = ICON[r.kind];
            return (
              <li key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                    if (r.kind === 'query' || r.kind === 'recent' || r.kind === 'popular')
                      recentSearches.add(r.label);
                    router.push(r.href);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    i === active ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                >
                  {r.image ? (
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Img src={r.image} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                  ) : (
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                  {r.meta && (
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {r.meta}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
