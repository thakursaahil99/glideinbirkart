'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminProductRow } from '@gk/types';
import { formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge, Skeleton, StatusBadge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { ServerTable } from '@/components/dashboard/data-table';
import { PageHeader, ReasonDialog } from '@/components/dashboard/common';

function ReviewPanel({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: p } = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => api.admin.products.get(id),
  });
  const [reject, setReject] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{p?.name ?? 'Loading…'}</DialogTitle>
          <DialogDescription>
            {p && `${p.sellerName} · ${p.categoryName}${p.brandName ? ` · ${p.brandName}` : ''}`}
          </DialogDescription>
        </DialogHeader>
        {!p ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="grid gap-5 md:grid-cols-[18rem_1fr]">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-2">
              {p.images.slice(0, 6).map((i) => (
                <div
                  key={i.id}
                  className="relative aspect-square overflow-hidden rounded-xl border bg-muted"
                >
                  <Img src={i.url} alt={i.alt ?? ''} fill sizes="140px" className="object-cover" />
                </div>
              ))}
            </div>
            <div className="min-w-0 space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={p.status} />
                <Badge variant="muted">GST {p.gstRate}%</Badge>
                {p.hsnCode && <Badge variant="muted">HSN {p.hsnCode}</Badge>}
                <Badge variant="muted">
                  {p.isReturnable ? `${p.returnWindowDays}-day returns` : 'No returns'}
                </Badge>
              </div>
              <p className="whitespace-pre-line text-foreground/85">{p.description}</p>
              {p.highlights.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {p.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-left uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Variant</th>
                      <th className="px-3 py-2 text-right">MRP</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.variants.map((v) => (
                      <tr key={v.id} className="border-t">
                        <td className="px-3 py-1.5 font-mono">{v.sku}</td>
                        <td className="px-3 py-1.5">{v.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(v.mrp)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatINR(v.price)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{v.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.specifications.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {p.specifications.map((s) => (
                    <div key={s.key} className="flex justify-between gap-2 border-b py-1">
                      <dt className="text-muted-foreground">{s.key}</dt>
                      <dd className="font-medium">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {p.rejectionReason && (
                <p className="rounded-lg bg-destructive/10 p-3 text-destructive">
                  <b>Previous rejection:</b> {p.rejectionReason}
                </p>
              )}
              {['PENDING_REVIEW', 'ACTIVE'].includes(p.status) && (
                <div className="flex gap-2 border-t pt-4">
                  {p.status === 'PENDING_REVIEW' && (
                    <Button
                      data-testid="approve-product"
                      onClick={async () => {
                        try {
                          await api.admin.products.approve(id);
                          toast.success('Product approved and live');
                          onChanged();
                          onClose();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Check /> Approve & publish
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setReject(true)}
                  >
                    <X /> {p.status === 'ACTIVE' ? 'Take down' : 'Reject'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <ReasonDialog
          open={reject}
          onOpenChange={setReject}
          title="Reject product"
          description="The seller receives this reason by email and in-app."
          confirmLabel="Reject product"
          destructive
          minLength={5}
          label="Reason for the seller"
          onConfirm={async (reason) => {
            await api.admin.products.reject(id, reason);
            toast.success('Product rejected');
            onChanged();
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AdminProducts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const columns: ColumnDef<AdminProductRow>[] = [
    {
      accessorKey: 'name',
      header: 'Product',
      meta: { sortKey: 'name' },
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-3">
          <span className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
            <Img src={p.image} alt="" fill sizes="48px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-1 font-semibold">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {p.categoryName}
              {p.brandName ? ` · ${p.brandName}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'sellerName',
      header: 'Seller',
      cell: ({ row }) => <span className="font-medium">{row.original.sellerName}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'minPrice',
      header: 'Price',
      meta: { sortKey: 'minPrice' },
      cell: ({ row }) => (
        <span className="tabular-nums">from {formatINR(row.original.minPrice)}</span>
      ),
    },
    {
      accessorKey: 'totalStock',
      header: 'Stock',
      meta: { sortKey: 'totalStock' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.totalStock}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      meta: { sortKey: 'createdAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'review',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: p } }) => (
        <Button
          size="sm"
          variant={p.status === 'PENDING_REVIEW' ? 'default' : 'outline'}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(p.id);
          }}
        >
          {p.status === 'PENDING_REVIEW' ? 'Review' : 'View'}
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Product moderation"
        description="New listings and content edits are reviewed here before going live."
      />
      <ServerTable<AdminProductRow>
        queryKey="admin-products"
        initialFilters={{ status: 'PENDING_REVIEW' }}
        fetcher={(p) => api.admin.products.list(p)}
        columns={columns}
        searchPlaceholder="Search product or seller…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'DRAFT', 'ARCHIVED'].map((s) => ({
              value: s,
              label: s.replace('_', ' '),
            })),
          },
        ]}
        onRowClick={(p) => setOpen(p.id)}
        emptyTitle="Queue is clear 🎉"
        emptyDescription="No products are waiting for review."
      />
      {open && (
        <ReviewPanel
          id={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            void qc.invalidateQueries({ queryKey: ['table', 'admin-products'] });
            void qc.invalidateQueries({ queryKey: ['admin-queues'] });
            void qc.invalidateQueries({ queryKey: ['admin-product', open] });
          }}
        />
      )}
    </>
  );
}
