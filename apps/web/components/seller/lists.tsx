'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  InventoryRow,
  PayoutDto,
  SellerProductRow,
  SellerQuestionRow,
  SellerReturnRow,
  SellerReviewRow,
  SellerSubOrderRow,
} from '@gk/types';
import { formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { errMsg } from '@/lib/forms';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StatusBadge,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/form';
import { Img } from '@/components/ui/img';
import { Stars } from '@/components/store/price';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/overlay';
import { ServerTable } from '@/components/dashboard/data-table';
import { inr, PageHeader, ReasonDialog, StatCard } from '@/components/dashboard/common';
import { Wallet, Hourglass, IndianRupee } from 'lucide-react';

const money = (n: number) => formatINR(n, true);

// ───────────────────────── products ─────────────────────────
export function SellerProductsTable() {
  const qc = useQueryClient();
  const router = useRouter();
  const [del, setDel] = useState<SellerProductRow | null>(null);
  const act = async (id: string, action: 'ARCHIVE' | 'UNARCHIVE' | 'SUBMIT') => {
    try {
      await api.seller.products.setStatus(id, action);
      toast.success(
        action === 'SUBMIT'
          ? 'Submitted for review'
          : action === 'ARCHIVE'
            ? 'Product archived'
            : 'Product restored to drafts',
      );
      void qc.invalidateQueries({ queryKey: ['table', 'seller-products'] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const columns: ColumnDef<SellerProductRow>[] = [
    {
      id: 'product',
      header: 'Product',
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-3">
          <span className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
            <Img src={p.image} alt="" fill sizes="48px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-1 font-semibold">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {p.categoryName} · {p.variantCount} {p.variantCount === 1 ? 'variant' : 'variants'}
            </p>
            {p.status === 'REJECTED' && p.rejectionReason && (
              <p className="mt-0.5 line-clamp-1 text-xs text-destructive" title={p.rejectionReason}>
                ⚠ {p.rejectionReason}
              </p>
            )}
          </div>
        </div>
      ),
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
        <span className="font-semibold tabular-nums">from {formatINR(row.original.minPrice)}</span>
      ),
    },
    {
      accessorKey: 'totalStock',
      header: 'Stock',
      meta: { sortKey: 'totalStock' },
      cell: ({ row }) => (
        <span
          className={row.original.totalStock <= 5 ? 'font-bold text-destructive' : 'tabular-nums'}
        >
          {row.original.totalStock}
        </span>
      ),
    },
    {
      accessorKey: 'soldCount',
      header: 'Sold',
      meta: { sortKey: 'soldCount' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.soldCount}</span>,
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
      id: 'actions',
      header: '',
      meta: { className: 'w-12 text-right' },
      cell: ({ row: { original: p } }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Actions for ${p.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem asChild>
              <Link href={`/seller/products/${p.id}`}>
                <Pencil /> Edit
              </Link>
            </DropdownMenuItem>
            {['DRAFT', 'REJECTED'].includes(p.status) && (
              <DropdownMenuItem onSelect={() => act(p.id, 'SUBMIT')}>
                <Send /> Submit for review
              </DropdownMenuItem>
            )}
            {p.status === 'ARCHIVED' ? (
              <DropdownMenuItem onSelect={() => act(p.id, 'UNARCHIVE')}>
                <ArchiveRestore /> Restore
              </DropdownMenuItem>
            ) : (
              p.status !== 'PENDING_REVIEW' && (
                <DropdownMenuItem onSelect={() => act(p.id, 'ARCHIVE')}>
                  <Archive /> Archive
                </DropdownMenuItem>
              )
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setDel(p)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Products"
        description="Create listings, manage variants and track moderation status."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/seller/products/bulk">
                <Upload /> Bulk upload
              </Link>
            </Button>
            <Button asChild>
              <Link href="/seller/products/new">
                <Plus /> Add product
              </Link>
            </Button>
          </>
        }
      />
      <ServerTable<SellerProductRow>
        queryKey="seller-products"
        fetcher={(p) =>
          api.seller.products.list({
            page: p.page,
            limit: p.limit,
            q: p.q,
            status: p.status as string | undefined,
            sort: p.sort,
            ...(p.order ? { order: p.order } : {}),
          } as never)
        }
        columns={columns}
        searchPlaceholder="Search name or SKU…"
        defaultSort={{ key: 'createdAt', order: 'desc' }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED'].map((s) => ({
              value: s,
              label: s.replace('_', ' '),
            })),
          },
        ]}
        emptyTitle="No products yet"
        emptyDescription="Add your first product to start selling."
        onRowClick={(p) => router.push(`/seller/products/${p.id}`)}
      />
      <ReasonDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete “${del?.name ?? ''}”?`}
        description="This can’t be undone. Products with orders can only be archived."
        confirmLabel="Delete product"
        destructive
        requireReason={false}
        label=""
        onConfirm={async () => {
          await api.seller.products.remove(del!.id);
          toast.success('Product deleted');
          void qc.invalidateQueries({ queryKey: ['table', 'seller-products'] });
        }}
      />
    </>
  );
}

// ───────────────────────── inventory ─────────────────────────
function StockEditor({ row }: { row: InventoryRow }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(row.quantity));
  const [busy, setBusy] = useState(false);
  const dirty = Number(qty) !== row.quantity;
  const save = async () => {
    setBusy(true);
    try {
      await api.seller.inventory.update(row.variantId, { quantity: Number(qty) });
      toast.success(`${row.sku} updated`);
      void qc.invalidateQueries({ queryKey: ['table', 'seller-inventory'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) void save();
      }}
    >
      <Input
        aria-label={`Stock for ${row.sku}`}
        inputMode="numeric"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
        className="h-9 w-24 text-center"
      />
      {dirty && (
        <Button type="submit" size="icon-sm" loading={busy} aria-label="Save stock">
          <Check />
        </Button>
      )}
    </form>
  );
}

export function SellerInventoryTable() {
  const params = useSearchParams();
  const columns: ColumnDef<InventoryRow>[] = [
    {
      id: 'item',
      header: 'SKU',
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center gap-3">
          <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
            <Img src={r.image} alt="" fill sizes="40px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-1 font-semibold">{r.productName}</p>
            <p className="text-xs text-muted-foreground">
              {r.variantName} · <span className="font-mono">{r.sku}</span>
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'avail',
      header: 'Available',
      cell: ({ row: { original: r } }) => (
        <span
          className={r.isLow ? 'font-extrabold text-destructive' : 'font-semibold tabular-nums'}
        >
          {r.available}
          {r.isLow && (
            <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase">
              {r.available === 0 ? 'Out' : 'Low'}
            </span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'reserved',
      header: 'Reserved',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{row.original.reserved}</span>
      ),
    },
    {
      accessorKey: 'lowStockThreshold',
      header: 'Alert at',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          ≤ {row.original.lowStockThreshold}
        </span>
      ),
    },
    {
      id: 'edit',
      header: 'On-hand quantity',
      cell: ({ row }) => <StockEditor row={row.original} />,
    },
  ];
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Per-SKU stock. Edit a quantity and press ✓ to save. Reserved units are held for unpaid online orders."
      />
      <ServerTable<InventoryRow>
        key={params.get('low') ?? 'all'}
        queryKey="seller-inventory"
        initialFilters={params.get('low') === 'true' ? { low: 'true' } : undefined}
        fetcher={(p) =>
          api.seller.inventory.list({ page: p.page, limit: p.limit, q: p.q, low: p.low === 'true' })
        }
        columns={columns}
        searchPlaceholder="Search product or SKU…"
        filters={[
          { key: 'low', label: 'Stock', options: [{ value: 'true', label: 'Low / out of stock' }] },
        ]}
        rowId={(r) => r.variantId}
        pageSize={20}
      />
    </>
  );
}

// ───────────────────────── orders ─────────────────────────
export function SellerOrdersTable() {
  const router = useRouter();
  const params = useSearchParams();
  const columns: ColumnDef<SellerSubOrderRow>[] = [
    {
      accessorKey: 'subOrderNumber',
      header: 'Order',
      meta: { sortKey: 'subOrderNumber' },
      cell: ({ row: { original: o } }) => (
        <div>
          <p className="font-bold">{o.subOrderNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</p>
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row: { original: o } }) => (
        <div>
          <p className="font-medium">{o.customerName}</p>
          <p className="text-xs text-muted-foreground">{o.city}</p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'pay',
      header: 'Payment',
      cell: ({ row: { original: o } }) => (
        <div className="text-xs">
          <p className="font-semibold">{o.paymentMethod === 'COD' ? 'COD' : 'Prepaid'}</p>
          <StatusBadge status={o.paymentStatus} />
        </div>
      ),
    },
    {
      accessorKey: 'itemCount',
      header: 'Items',
      cell: ({ row }) => <span className="tabular-nums">{row.original.itemCount}</span>,
    },
    {
      accessorKey: 'total',
      header: 'Total',
      meta: { sortKey: 'total', className: 'text-right' },
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">{money(row.original.total)}</span>
      ),
    },
    {
      accessorKey: 'sellerEarning',
      header: 'You earn',
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums text-success">
          {money(row.original.sellerEarning)}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Orders"
        description="Accept new orders, pack, ship with a tracking number, and print labels."
      />
      <ServerTable<SellerSubOrderRow>
        key={params.get('status') ?? 'all'}
        queryKey="seller-orders"
        initialFilters={
          params.get('status') ? { status: params.get('status') as string } : undefined
        }
        fetcher={(p) =>
          api.seller.orders.list({
            page: p.page,
            limit: p.limit,
            q: p.q,
            status: p.status as string | undefined,
            sort: p.sort,
            order: p.order,
          } as never)
        }
        columns={columns}
        searchPlaceholder="Search order, tracking, customer…"
        defaultSort={{ key: 'createdAt', order: 'desc' }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              'PENDING',
              'ACCEPTED',
              'PACKED',
              'SHIPPED',
              'DELIVERED',
              'CANCELLED',
              'RETURNED',
            ].map((s) => ({ value: s, label: s })),
          },
        ]}
        onRowClick={(o) => router.push(`/seller/orders/${o.id}`)}
        emptyTitle="No orders yet"
      />
    </>
  );
}

// ───────────────────────── returns ─────────────────────────
export function SellerReturnsTable() {
  const qc = useQueryClient();
  const [reject, setReject] = useState<SellerReturnRow | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['table', 'seller-returns'] });
  const columns: ColumnDef<SellerReturnRow>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center gap-3">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
            <Img src={r.itemImage} alt="" fill sizes="44px" className="object-cover" />
          </span>
          <div>
            <p className="line-clamp-1 font-semibold">
              {r.itemName} × {r.quantity}
            </p>
            <p className="text-xs text-muted-foreground">
              Order {r.orderNumber} · {r.customerName}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'reason',
      header: 'Reason',
      cell: ({ row: { original: r } }) => (
        <div className="max-w-xs text-sm">
          <p className="font-medium">{r.reason}</p>
          {r.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
          )}
          {r.images.length > 0 && (
            <div className="mt-1 flex gap-1">
              {r.images.slice(0, 3).map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="relative size-8 overflow-hidden rounded border"
                >
                  <Img src={u} alt="Return photo" fill sizes="32px" className="object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Requested',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-2">
          {r.status === 'REQUESTED' && (
            <>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await api.seller.returns.decide(r.id, 'APPROVE');
                    toast.success('Return approved');
                    void refresh();
                  } catch (e) {
                    toast.error(errMsg(e));
                  }
                }}
              >
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setReject(r)}>
                Reject
              </Button>
            </>
          )}
          {r.status === 'APPROVED' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await api.seller.returns.received(r.id);
                  toast.success('Marked as received — admin will issue the refund');
                  void refresh();
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Mark received
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Returns"
        description="Approve or reject customer returns. Rejected returns can be escalated by the customer to our team."
      />
      <ServerTable<SellerReturnRow>
        queryKey="seller-returns"
        fetcher={(p) =>
          api.seller.returns.list({
            page: p.page,
            limit: p.limit,
            status: p.status as string | undefined,
          })
        }
        columns={columns}
        hideSearch
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['REQUESTED', 'APPROVED', 'REJECTED', 'ESCALATED', 'RECEIVED', 'REFUNDED'].map(
              (s) => ({ value: s, label: s }),
            ),
          },
        ]}
        emptyTitle="No return requests"
      />
      <ReasonDialog
        open={!!reject}
        onOpenChange={(o) => !o && setReject(null)}
        title="Reject this return?"
        description="Explain why — the customer will see this and can escalate."
        confirmLabel="Reject return"
        destructive
        minLength={5}
        label="Reason for rejection"
        onConfirm={async (reason) => {
          await api.seller.returns.decide(reject!.id, 'REJECT', reason);
          toast.success('Return rejected');
          void refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── payouts ─────────────────────────
export function SellerPayouts() {
  const { data: balance, isLoading } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.seller.payouts.balance(),
  });
  const [open, setOpen] = useState<PayoutDto | null>(null);
  const { data: items } = useQuery({
    queryKey: ['payout-items', open?.id],
    queryFn: () => api.seller.payouts.items(open!.id),
    enabled: !!open,
  });
  const columns: ColumnDef<PayoutDto>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'period',
      header: 'Period',
      cell: ({ row: { original: p } }) => (
        <span className="text-muted-foreground">
          {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
        </span>
      ),
    },
    {
      accessorKey: 'grossAmount',
      header: 'Gross sales',
      meta: { className: 'text-right' },
      cell: ({ row }) => <span className="tabular-nums">{money(row.original.grossAmount)}</span>,
    },
    {
      accessorKey: 'commissionAmount',
      header: 'Commission',
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-destructive">
          − {money(row.original.commissionAmount)}
        </span>
      ),
    },
    {
      accessorKey: 'netAmount',
      header: 'Net payout',
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="font-bold tabular-nums">{money(row.original.netAmount)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <div>
          <StatusBadge status={row.original.status} />
          {row.original.reference && (
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {row.original.reference}
            </p>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Earnings are released after the return window. Commission is deducted per category rules."
      />
      {isLoading || !balance ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Available for payout"
            value={inr(balance.pending)}
            icon={Wallet}
            tone="success"
            hint="next admin settlement"
          />
          <StatCard
            label="On hold"
            value={inr(balance.onHold)}
            icon={Hourglass}
            tone="accent"
            hint="inside return window"
          />
          <StatCard label="Settled" value={inr(balance.settled)} icon={IndianRupee} />
          <StatCard
            label="Commission paid"
            value={inr(balance.commissionPaid)}
            icon={Wallet}
            tone="deal"
            hint={`lifetime earnings ${inr(balance.lifetimeEarnings)}`}
          />
        </div>
      )}
      <ServerTable<PayoutDto>
        queryKey="seller-payouts"
        fetcher={(p) => api.seller.payouts.list({ page: p.page, limit: p.limit })}
        columns={columns}
        hideSearch
        onRowClick={setOpen}
        emptyTitle="No payouts yet"
        emptyDescription="Your first payout appears after delivered orders clear the return window."
      />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Settlement details</DialogTitle>
            <DialogDescription>
              {open &&
                `${money(open.netAmount)} · ${open.status}${open.reference ? ` · UTR ${open.reference}` : ''}`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50dvh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Delivered</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Commission</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((i) => (
                  <tr key={i.subOrderNumber} className="border-t">
                    <td className="px-3 py-2 font-medium">{i.subOrderNumber}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(i.deliveredAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">
                      −{money(i.commission)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {money(i.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── reviews & questions ─────────────────────────
export function SellerReviews() {
  const qc = useQueryClient();
  const [reply, setReply] = useState<SellerReviewRow | null>(null);
  const [text, setText] = useState('');
  const columns: ColumnDef<SellerReviewRow>[] = [
    {
      id: 'review',
      header: 'Review',
      cell: ({ row: { original: r } }) => (
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <Stars value={r.rating} size={13} />
            <b className="text-sm">{r.title}</b>
          </div>
          <p className="text-sm text-muted-foreground">{r.body}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.productName} · {r.customerName} · {formatDate(r.createdAt)}
          </p>
          {r.sellerReply && (
            <p className="mt-1.5 rounded-lg bg-secondary/60 p-2 text-xs">
              <b>Your reply:</b> {r.sellerReply}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'a',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: r } }) => (
        <Button
          size="sm"
          variant={r.sellerReply ? 'outline' : 'default'}
          onClick={() => {
            setReply(r);
            setText(r.sellerReply ?? '');
          }}
        >
          {r.sellerReply ? 'Edit reply' : 'Reply'}
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Respond publicly to customer reviews — it builds trust."
      />
      <ServerTable<SellerReviewRow>
        queryKey="seller-reviews"
        fetcher={(p) =>
          api.seller.reviews.list({
            page: p.page,
            limit: p.limit,
            unreplied: p.unreplied === 'true',
          })
        }
        columns={columns}
        hideSearch
        filters={[
          {
            key: 'unreplied',
            label: 'Replies',
            options: [{ value: 'true', label: 'Awaiting reply' }],
          },
        ]}
        emptyTitle="No reviews yet"
      />
      <Dialog open={!!reply} onOpenChange={(o) => !o && setReply(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reply to {reply?.customerName}</DialogTitle>
            <DialogDescription className="line-clamp-2">{reply?.title}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Your reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Thank the customer or offer help…"
          />
          <DialogFooter>
            <Button
              disabled={text.trim().length < 2}
              onClick={async () => {
                try {
                  await api.seller.reviews.reply(reply!.id, text.trim());
                  toast.success('Reply posted');
                  setReply(null);
                  void qc.invalidateQueries({ queryKey: ['table', 'seller-reviews'] });
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Post reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SellerQuestions() {
  const qc = useQueryClient();
  const [answer, setAnswer] = useState<SellerQuestionRow | null>(null);
  const [text, setText] = useState('');
  const columns: ColumnDef<SellerQuestionRow>[] = [
    {
      id: 'q',
      header: 'Question',
      cell: ({ row: { original: q } }) => (
        <div className="max-w-xl">
          <p className="font-semibold">{q.body}</p>
          <p className="text-xs text-muted-foreground">
            {q.productName} · {q.customerName} · {formatDate(q.createdAt)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'answered',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.answered ? 'APPROVED' : 'PENDING'} />,
    },
    {
      id: 'a',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: q } }) => (
        <Button
          size="sm"
          variant={q.answered ? 'outline' : 'default'}
          onClick={() => {
            setAnswer(q);
            setText('');
          }}
        >
          {q.answered ? 'Add another answer' : 'Answer'}
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Customer questions"
        description="Answers from the seller are highlighted on the product page."
      />
      <ServerTable<SellerQuestionRow>
        queryKey="seller-questions"
        fetcher={(p) =>
          api.seller.questions.list({
            page: p.page,
            limit: p.limit,
            unanswered: p.unanswered === 'true',
          })
        }
        columns={columns}
        hideSearch
        filters={[
          {
            key: 'unanswered',
            label: 'Show',
            options: [{ value: 'true', label: 'Unanswered only' }],
          },
        ]}
        emptyTitle="No questions yet"
      />
      <Dialog open={!!answer} onOpenChange={(o) => !o && setAnswer(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Answer question</DialogTitle>
            <DialogDescription>{answer?.body}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Your answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Write a helpful, accurate answer…"
          />
          <DialogFooter>
            <Button
              disabled={text.trim().length < 2}
              onClick={async () => {
                try {
                  await api.qna.answer(answer!.id, text.trim());
                  toast.success('Answer posted');
                  setAnswer(null);
                  void qc.invalidateQueries({ queryKey: ['table', 'seller-questions'] });
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Post answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── bulk upload ─────────────────────────
export function BulkUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Awaited<
    ReturnType<typeof api.seller.products.bulkUpload>
  > | null>(null);
  return (
    <>
      <PageHeader
        title="Bulk upload"
        description="Create or update many products from a CSV. Rows sharing a group become variants of one product; existing SKUs update price and stock."
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              try {
                downloadBlob(
                  await api.seller.products.template(),
                  'glideinbir-kart-products-template.csv',
                );
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
          >
            <Download /> Download template
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <label className="grid cursor-pointer place-content-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary hover:bg-primary/5">
            <Upload className="mx-auto size-8 text-primary" />
            <span className="font-semibold">{file ? file.name : 'Choose a CSV file'}</span>
            <span className="text-xs text-muted-foreground">Up to 500 rows · 2 MB</span>
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setReport(null);
              }}
            />
          </label>
          <Button
            size="lg"
            disabled={!file}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setReport(await api.seller.products.bulkUpload(file!));
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Validate & import
          </Button>
        </CardContent>
      </Card>
      {report && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Validation report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['Rows', report.total],
                ['Products created', report.created],
                ['Variants updated', report.updated],
                ['Rows with errors', report.failed],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-muted/60 p-3 text-center">
                  <p className="text-2xl font-extrabold tabular-nums">{v}</p>
                  <p className="text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            {report.errors.length > 0 ? (
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-destructive/10 text-left text-xs uppercase text-destructive">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.errors.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono">{e.row}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.sku ?? '—'}</td>
                        <td className="px-3 py-2">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="All rows imported cleanly"
                description="New products are in the moderation queue."
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
