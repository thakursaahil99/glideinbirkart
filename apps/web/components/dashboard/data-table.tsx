'use client';

import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from 'lucide-react';
import type { Paginated } from '@gk/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/data';
import { Input, Select } from '@/components/ui/form';

export interface FilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export interface TableParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
  q?: string;
  [filter: string]: string | number | undefined;
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Server sort key; presence makes the column header sortable. */
    sortKey?: string;
    className?: string;
  }
}

function useDebounced<T>(v: T, ms = 350) {
  const [x, setX] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return x;
}

/**
 * Generic data table with SERVER-SIDE pagination, sorting, search and filters (TanStack Table v8 in manual mode).
 * The fetcher receives the exact params and returns { items, meta } from the API.
 */
export function ServerTable<T>({
  queryKey,
  fetcher,
  columns,
  filters = [],
  searchPlaceholder = 'Search…',
  defaultSort,
  pageSize = 15,
  toolbar,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  onRowClick,
  rowId,
  initialFilters,
  hideSearch,
}: {
  queryKey: string;
  fetcher: (p: TableParams) => Promise<Paginated<T, Record<string, unknown>>>;
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any -- TanStack column value types are heterogeneous per column
  filters?: FilterDef[];
  searchPlaceholder?: string;
  defaultSort?: { key: string; order: 'asc' | 'desc' };
  pageSize?: number;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  rowId?: (row: T) => string;
  initialFilters?: Record<string, string>;
  hideSearch?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters ?? {});
  const dq = useDebounced(q);

  useEffect(() => setPage(1), [dq, filterValues, sort]);

  const params: TableParams = {
    page,
    limit: pageSize,
    q: dq || undefined,
    sort: sort?.key,
    order: sort?.order,
    ...Object.fromEntries(Object.entries(filterValues).filter(([, v]) => v)),
  };
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['table', queryKey, params],
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    getRowId: rowId ? (r) => rowId(r) : undefined,
  });
  const activeFilters = Object.values(filterValues).filter(Boolean).length + (q ? 1 : 0);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key !== key
        ? { key, order: 'desc' }
        : s.order === 'desc'
          ? { key, order: 'asc' }
          : defaultSort && defaultSort.key !== key
            ? defaultSort
            : undefined,
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hideSearch && (
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search table"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
        )}
        {filters.map((f) => (
          <Select
            key={f.key}
            aria-label={f.label}
            value={filterValues[f.key] ?? ''}
            onChange={(e) => setFilterValues((v) => ({ ...v, [f.key]: e.target.value }))}
            wrapperClassName="w-auto min-w-[9rem]"
            className="h-10 text-[13px] font-medium"
          >
            <option value="">{f.label}: All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              setFilterValues({});
            }}
          >
            <X /> Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-2xl border bg-card shadow-soft transition-opacity',
          isFetching && !isLoading && 'opacity-70',
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sortKey = h.column.columnDef.meta?.sortKey;
                    const active = sort?.key === sortKey;
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={
                          sortKey
                            ? active
                              ? sort?.order === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                            : undefined
                        }
                        className={cn(
                          'h-11 px-4 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
                          h.column.columnDef.meta?.className,
                        )}
                      >
                        {h.isPlaceholder ? null : sortKey ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(sortKey)}
                            className={cn(
                              'inline-flex items-center gap-1 uppercase hover:text-foreground',
                              active && 'text-foreground',
                            )}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {active ? (
                              sort?.order === 'asc' ? (
                                <ArrowUp className="size-3" />
                              ) : (
                                <ArrowDown className="size-3" />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-50" />
                            )}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={columns.length} className="p-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={columns.length} className="p-8 text-center text-destructive">
                    Could not load data. Please try again.
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-6">
                    <EmptyState
                      title={emptyTitle}
                      description={
                        emptyDescription ??
                        (activeFilters ? 'No results match your search or filters.' : undefined)
                      }
                      className="border-0 py-10"
                    />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-b last:border-0 transition-colors hover:bg-muted/40',
                      onRowClick && 'cursor-pointer',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-3 align-middle',
                          cell.column.columnDef.meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              Showing {(data.meta.page - 1) * data.meta.limit + 1}–
              {Math.min(data.meta.page * data.meta.limit, data.meta.total)} of{' '}
              {data.meta.total.toLocaleString('en-IN')}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="px-1 text-xs text-muted-foreground">
                Page {data.meta.page} / {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.meta.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
