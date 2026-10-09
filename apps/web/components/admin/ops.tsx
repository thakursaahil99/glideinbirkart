'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Ban, CheckCircle2, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cmsPageInputSchema, commissionRuleInputSchema, siteSettingsSchema } from '@gk/validators';
import type {
  AdminOrderRow,
  AdminReturnRow,
  AdminUserRow,
  AuditLogDto,
  CmsPageDto,
  CommissionRuleDto,
  PayoutDto,
} from '@gk/types';
import { formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { applyApiError, errMsg, useZodForm } from '@/lib/forms';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { CheckRow, Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { OrderTimeline } from '@/components/store/order-parts';
import { ServerTable } from '@/components/dashboard/data-table';
import { inr, PageHeader, ReasonDialog, StatCard } from '@/components/dashboard/common';
import { PincodesAdmin } from './crud';
import { IndianRupee, Hourglass, Wallet } from 'lucide-react';

const money = (n: number) => formatINR(n, true);

// ───────────────────────── users ─────────────────────────
export function UsersAdmin() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['table', 'admin-users'] });
  };
  const columns: ColumnDef<AdminUserRow>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      meta: { sortKey: 'name' },
      cell: ({ row: { original: u } }) => (
        <div>
          <p className="font-semibold">{u.name}</p>
          <p className="text-xs text-muted-foreground">{u.email ?? u.phone}</p>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={row.original.role === 'CUSTOMER' ? 'muted' : 'default'}>
          {row.original.role.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'orderCount',
      header: 'Orders',
      cell: ({ row }) => <span className="tabular-nums">{row.original.orderCount}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      meta: { sortKey: 'createdAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last login',
      meta: { sortKey: 'lastLoginAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.lastLoginAt)}
        </span>
      ),
    },
    {
      id: 'a',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: u } }) =>
        u.status === 'BLOCKED' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await api.admin.users.block(u.id, false);
                toast.success(`${u.name} unblocked`);
                refresh();
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
          >
            <CheckCircle2 /> Unblock
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setTarget(u)}
          >
            <Ban /> Block
          </Button>
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Users"
        description="Customers, sellers and staff. Blocking ends all of a user’s sessions immediately."
      />
      <ServerTable<AdminUserRow>
        queryKey="admin-users"
        fetcher={(p) => api.admin.users.list(p)}
        columns={columns}
        searchPlaceholder="Search name, email, phone…"
        defaultSort={{ key: 'createdAt', order: 'desc' }}
        filters={[
          {
            key: 'role',
            label: 'Role',
            options: ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'].map((r) => ({
              value: r,
              label: r,
            })),
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'BLOCKED', label: 'Blocked' },
            ],
          },
        ]}
      />
      <ReasonDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Block ${target?.name}?`}
        description="They will be signed out everywhere and unable to sign in."
        confirmLabel="Block user"
        destructive
        requireReason={false}
        label="Reason (optional)"
        onConfirm={async (reason) => {
          await api.admin.users.block(target!.id, true, reason || undefined);
          toast.success('User blocked');
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── orders ─────────────────────────
export function OrdersAdmin() {
  const router = useRouter();
  const columns: ColumnDef<AdminOrderRow>[] = [
    {
      accessorKey: 'orderNumber',
      header: 'Order',
      meta: { sortKey: 'orderNumber' },
      cell: ({ row: { original: o } }) => (
        <div>
          <p className="font-bold">{o.orderNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</p>
        </div>
      ),
    },
    { accessorKey: 'customerName', header: 'Customer' },
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
          <p className="font-semibold">{o.paymentMethod === 'COD' ? 'COD' : 'Online'}</p>
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
        <span className="font-bold tabular-nums">{money(row.original.total)}</span>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Orders" description="Every order across all sellers." />
      <ServerTable<AdminOrderRow>
        queryKey="admin-orders"
        fetcher={(p) => api.admin.orders.list(p)}
        columns={columns}
        searchPlaceholder="Search order no., customer, email…"
        defaultSort={{ key: 'createdAt', order: 'desc' }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              'PENDING_PAYMENT',
              'PLACED',
              'PROCESSING',
              'SHIPPED',
              'DELIVERED',
              'CANCELLED',
              'PAYMENT_FAILED',
            ].map((s) => ({ value: s, label: s.replace('_', ' ') })),
          },
        ]}
        onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
      />
    </>
  );
}

export function OrderAdminDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: o, isLoading } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => api.admin.orders.get(id),
  });
  const [cancel, setCancel] = useState(false);
  const [refund, setRefund] = useState(false);
  const [amount, setAmount] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-order', id] });
    void qc.invalidateQueries({ queryKey: ['table', 'admin-orders'] });
  };
  if (isLoading || !o) return <Skeleton className="h-96" />;
  const a = o.shippingAddress as {
    fullName: string;
    line1: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  const cancellable = ['PENDING_PAYMENT', 'PLACED', 'PROCESSING'].includes(o.status);
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin/orders">
          <ArrowLeft /> All orders
        </Link>
      </Button>
      <PageHeader
        title={o.orderNumber}
        description={`${o.customer.name} · ${o.customer.email ?? o.customer.phone ?? ''} · ${formatDateTime(o.createdAt)}`}
        actions={
          <>
            <StatusBadge status={o.status} />
            {!['PENDING_PAYMENT', 'PAYMENT_FAILED'].includes(o.status) && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    downloadBlob(
                      await api.admin.orders.invoice(id),
                      `invoice-${o.orderNumber}.pdf`,
                    );
                  } catch (e) {
                    toast.error(errMsg(e));
                  }
                }}
              >
                <Download /> Invoice
              </Button>
            )}
            {['PAID', 'PARTIALLY_REFUNDED'].includes(o.paymentStatus) && (
              <Button variant="outline" onClick={() => setRefund(true)}>
                Issue refund
              </Button>
            )}
            {cancellable && (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setCancel(true)}
              >
                Cancel order
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {o.subOrders.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>
                  {s.sellerName}{' '}
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {s.subOrderNumber}
                  </span>
                </CardTitle>
                <StatusBadge status={s.status} />
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {s.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        <Img src={i.image} alt="" fill sizes="48px" className="object-cover" />
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="line-clamp-1 font-semibold">{i.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.variantName} · Qty {i.quantity}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {money(i.lineTotal - i.discount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {s.trackingId && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {s.courier} · <span className="font-mono">{s.trackingId}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline events={o.timeline} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <b>{o.paymentMethod}</b>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={o.paymentStatus} />
              </p>
              <p className="flex justify-between border-t pt-2 text-base font-extrabold">
                <span>Total</span>
                {money(o.total)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ship to</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{a.fullName}</p>
              <p>{a.line1}</p>
              <p>
                {a.city}, {a.state} – {a.pincode}
              </p>
              <p>{a.phone}</p>
            </CardContent>
          </Card>
          {o.refunds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {o.refunds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <span>
                      {money(r.amount)}{' '}
                      <span className="text-xs text-muted-foreground">{r.reason}</span>
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <ReasonDialog
        open={cancel}
        onOpenChange={setCancel}
        title="Cancel this order?"
        description="Stock is restored and prepaid orders are refunded."
        confirmLabel="Cancel order"
        destructive
        label="Reason"
        onConfirm={async (reason) => {
          await api.admin.orders.cancel(id, reason);
          toast.success('Order cancelled');
          refresh();
        }}
      />
      <Dialog open={refund} onOpenChange={setRefund}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Issue a refund</DialogTitle>
            <DialogDescription>
              Refunds go back through Razorpay to the customer’s original payment method.
            </DialogDescription>
          </DialogHeader>
          <Field label="Amount ₹" htmlFor="rf-amt" required>
            <Input
              id="rf-amt"
              type="number"
              min={1}
              step="0.01"
              max={o.total}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <ReasonField
            onSubmit={async (reason) => {
              await api.admin.orders.refund(id, Number(amount), reason);
              toast.success('Refund initiated');
              setRefund(false);
              refresh();
            }}
            disabled={!(Number(amount) > 0)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReasonField({
  onSubmit,
  disabled,
}: {
  onSubmit: (reason: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Field label="Reason" htmlFor="rf-reason" required>
        <Textarea
          id="rf-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button
          loading={busy}
          disabled={disabled || reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(reason.trim());
            } catch (e) {
              toast.error(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Refund
        </Button>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── returns & disputes ─────────────────────────
export function ReturnsAdmin() {
  const qc = useQueryClient();
  const [act, setAct] = useState<{
    row: AdminReturnRow;
    decision: 'APPROVE' | 'REJECT' | 'REFUND';
  } | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['table', 'admin-returns'] });
    void qc.invalidateQueries({ queryKey: ['admin-queues'] });
  };
  const columns: ColumnDef<AdminReturnRow>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center gap-3">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
            <Img src={r.itemImage} alt="" fill sizes="44px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-1 font-semibold">
              {r.itemName} × {r.quantity}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.orderNumber} · {r.customerName} → {r.sellerName}
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
          {r.sellerRemarks && (
            <p className="mt-0.5 text-xs text-muted-foreground">Seller: “{r.sellerRemarks}”</p>
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
      accessorKey: 'refundAmount',
      header: 'Refund',
      cell: ({ row }) =>
        row.original.refundAmount != null ? money(row.original.refundAmount) : '—',
    },
    {
      id: 'a',
      header: '',
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-1.5">
          {['ESCALATED', 'REQUESTED'].includes(r.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAct({ row: r, decision: 'APPROVE' })}
            >
              Approve
            </Button>
          )}
          {['ESCALATED', 'REQUESTED', 'APPROVED'].includes(r.status) && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => setAct({ row: r, decision: 'REJECT' })}
            >
              Close
            </Button>
          )}
          {['ESCALATED', 'APPROVED', 'PICKED_UP', 'RECEIVED'].includes(r.status) && (
            <Button size="sm" onClick={() => setAct({ row: r, decision: 'REFUND' })}>
              Refund
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Returns, refunds & disputes"
        description="Escalated returns are disputes between a customer and a seller — decide them here and issue refunds."
      />
      <ServerTable<AdminReturnRow>
        queryKey="admin-returns"
        initialFilters={{ status: 'ESCALATED' }}
        fetcher={(p) => api.admin.returns.list(p)}
        columns={columns}
        searchPlaceholder="Search order or item…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              'REQUESTED',
              'APPROVED',
              'REJECTED',
              'ESCALATED',
              'RECEIVED',
              'REFUNDED',
              'CLOSED',
            ].map((s) => ({ value: s, label: s })),
          },
        ]}
        emptyTitle="No returns in this view"
      />
      <ReasonDialog
        open={!!act}
        onOpenChange={(o) => !o && setAct(null)}
        title={
          act?.decision === 'REFUND'
            ? 'Issue refund'
            : act?.decision === 'APPROVE'
              ? 'Approve return'
              : 'Close return'
        }
        description={
          act?.decision === 'REFUND'
            ? 'The customer is refunded the paid amount for the returned units, stock is restocked and the seller’s earnings are adjusted.'
            : undefined
        }
        confirmLabel={
          act?.decision === 'REFUND'
            ? 'Refund now'
            : act?.decision === 'APPROVE'
              ? 'Approve'
              : 'Close return'
        }
        destructive={act?.decision === 'REJECT'}
        requireReason={act?.decision === 'REJECT'}
        label={act?.decision === 'REJECT' ? 'Explanation for the customer' : 'Remarks (optional)'}
        onConfirm={async (remarks) => {
          await api.admin.returns.decide(act!.row.id, {
            decision: act!.decision,
            remarks: remarks || undefined,
          });
          toast.success('Done');
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── payouts ─────────────────────────
export function PayoutsAdmin() {
  const qc = useQueryClient();
  const { data: eligible } = useQuery({
    queryKey: ['payouts-eligible'],
    queryFn: () => api.admin.payouts.eligible(),
  });
  const [settle, setSettle] = useState<PayoutDto | null>(null);
  const [ref, setRef] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['table', 'admin-payouts'] });
    void qc.invalidateQueries({ queryKey: ['payouts-eligible'] });
  };
  const total = (eligible ?? []).reduce((n, e) => n + e.net, 0);
  const columns: ColumnDef<PayoutDto>[] = [
    {
      accessorKey: 'sellerName',
      header: 'Seller',
      cell: ({ row }) => <span className="font-semibold">{row.original.sellerName}</span>,
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
      header: 'Gross',
      meta: { className: 'text-right' },
      cell: ({ row }) => <span className="tabular-nums">{money(row.original.grossAmount)}</span>,
    },
    {
      accessorKey: 'commissionAmount',
      header: 'Commission',
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-destructive">
          −{money(row.original.commissionAmount)}
        </span>
      ),
    },
    {
      accessorKey: 'netAmount',
      header: 'Net payable',
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
            <p className="font-mono text-[11px] text-muted-foreground">{row.original.reference}</p>
          )}
        </div>
      ),
    },
    {
      id: 'a',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: p } }) =>
        p.status === 'PENDING' ? (
          <Button
            size="sm"
            onClick={() => {
              setSettle(p);
              setRef('');
            }}
          >
            Mark settled
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Batch delivered orders past the return window into payouts, then mark them settled with the bank UTR."
        actions={
          <Button
            disabled={!eligible?.length}
            onClick={async () => {
              try {
                const r = await api.admin.payouts.generate();
                toast.success(`${r.created} payout(s) created · ${money(r.total)}`);
                refresh();
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
            data-testid="generate-payouts"
          >
            Generate payouts
          </Button>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Eligible now"
          value={inr(total)}
          icon={Wallet}
          tone="success"
          hint={`${eligible?.length ?? 0} sellers`}
        />
        <StatCard
          label="Sellers awaiting payout"
          value={eligible?.length ?? 0}
          icon={Hourglass}
          tone="accent"
        />
        <StatCard
          label="Orders included"
          value={(eligible ?? []).reduce((n, e) => n + e.orders, 0)}
          icon={IndianRupee}
        />
      </div>
      {!!eligible?.length && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Eligible for payout</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Seller</th>
                  <th>Orders</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {eligible.map((e) => (
                  <tr key={e.sellerId} className="border-t">
                    <td className="py-2.5 font-semibold">
                      {e.storeName} {!e.bankReady && <Badge variant="destructive">No bank</Badge>}
                    </td>
                    <td>{e.orders}</td>
                    <td className="text-right tabular-nums">{money(e.gross)}</td>
                    <td className="text-right tabular-nums text-destructive">
                      −{money(e.commission)}
                    </td>
                    <td className="text-right font-bold tabular-nums">{money(e.net)}</td>
                    <td className="text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await api.admin.payouts.generate(e.sellerId);
                            toast.success(`Payout created for ${e.storeName}`);
                            refresh();
                          } catch (err) {
                            toast.error(errMsg(err));
                          }
                        }}
                      >
                        Create
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <ServerTable<PayoutDto>
        queryKey="admin-payouts"
        fetcher={(p) => api.admin.payouts.list(p)}
        columns={columns}
        hideSearch
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'PENDING', label: 'Pending' },
              { value: 'SETTLED', label: 'Settled' },
            ],
          },
        ]}
        emptyTitle="No payouts yet"
      />
      <Dialog open={!!settle} onOpenChange={(o) => !o && setSettle(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Settle payout</DialogTitle>
            <DialogDescription>
              {settle && `${settle.sellerName} · ${money(settle.netAmount)}`}
            </DialogDescription>
          </DialogHeader>
          <Field label="Bank reference / UTR" htmlFor="utr" required>
            <Input
              id="utr"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="UTR2026…"
            />
          </Field>
          <DialogFooter>
            <Button
              disabled={ref.trim().length < 3}
              onClick={async () => {
                try {
                  await api.admin.payouts.settle(settle!.id, ref.trim());
                  toast.success('Payout settled — seller notified');
                  setSettle(null);
                  refresh();
                } catch (e) {
                  toast.error(errMsg(e));
                }
              }}
            >
              Confirm settlement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── commission rules ─────────────────────────
export function CommissionAdmin() {
  const qc = useQueryClient();
  const { data: rules, isLoading } = useQuery({
    queryKey: ['commission'],
    queryFn: () => api.admin.commission.list(),
  });
  const { data: cats } = useQuery({
    queryKey: ['categories-flat'],
    queryFn: () => api.catalog.categoriesFlat(),
  });
  const { data: sellers } = useQuery({
    queryKey: ['sellers-all'],
    queryFn: () => api.admin.sellers.list({ status: 'APPROVED', limit: 100 }),
  });
  const [open, setOpen] = useState(false);
  const form = useZodForm(commissionRuleInputSchema, {
    defaultValues: { scope: 'CATEGORY', rate: 10, isActive: true },
  });
  const scope = form.watch('scope');
  const e = form.formState.errors;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['commission'] });
  };
  return (
    <>
      <PageHeader
        title="Commission rules"
        description="Resolution order: seller override → category (nearest ancestor) → global → default setting."
        actions={
          <Button
            onClick={() => {
              form.reset({ scope: 'CATEGORY', rate: 10, isActive: true });
              setOpen(true);
            }}
          >
            <Plus /> Add rule
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Applies to</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(rules ?? []).map((r: CommissionRuleDto) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        r.scope === 'SELLER'
                          ? 'deal'
                          : r.scope === 'GLOBAL'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {r.scope}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {r.scope === 'GLOBAL' ? 'All products' : (r.categoryName ?? r.sellerName)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{r.rate}%</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete rule"
                      onClick={async () => {
                        try {
                          await api.admin.commission.remove(r.id);
                          toast.success('Rule removed');
                          refresh();
                        } catch (err) {
                          toast.error(errMsg(err));
                        }
                      }}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Commission rule</DialogTitle>
            <DialogDescription>
              Saving again for the same target updates the existing rule.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await api.admin.commission.save(v);
                toast.success('Rule saved');
                setOpen(false);
                refresh();
              } catch (err) {
                applyApiError(form, err);
              }
            })}
          >
            <Field label="Scope" htmlFor="cm-scope">
              <Select id="cm-scope" {...form.register('scope')}>
                <option value="GLOBAL">Global default</option>
                <option value="CATEGORY">Category</option>
                <option value="SELLER">Seller override</option>
              </Select>
            </Field>
            {scope === 'CATEGORY' && (
              <Field label="Category" htmlFor="cm-cat" error={e.categoryId?.message} required>
                <Select id="cm-cat" {...form.register('categoryId')}>
                  <option value="">Select…</option>
                  {(cats ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {'— '.repeat(c.depth)}
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {scope === 'SELLER' && (
              <Field label="Seller" htmlFor="cm-sel" error={e.sellerId?.message} required>
                <Select id="cm-sel" {...form.register('sellerId')}>
                  <option value="">Select…</option>
                  {(sellers?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.storeName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label="Commission %"
              htmlFor="cm-rate"
              error={e.rate?.message}
              required
              hint="Charged on the taxable value (excl. GST)"
            >
              <Input
                id="cm-rate"
                type="number"
                step="0.01"
                min={0}
                max={60}
                {...form.register('rate', { valueAsNumber: true })}
              />
            </Field>
            <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
              Save rule
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── CMS ─────────────────────────
export function CmsAdmin() {
  const qc = useQueryClient();
  const { data: pages, isLoading } = useQuery({
    queryKey: ['admin-cms'],
    queryFn: () => api.admin.cms.list(),
  });
  const [edit, setEdit] = useState<CmsPageDto | 'new' | null>(null);
  const form = useZodForm(cmsPageInputSchema, {
    defaultValues: { slug: '', title: '', content: '', isPublished: true },
  });
  const content = form.watch('content');
  const open = (p: CmsPageDto | 'new') => {
    setEdit(p);
    form.reset(
      p === 'new'
        ? { slug: '', title: '', content: '', isPublished: true }
        : { slug: p.slug, title: p.title, content: p.content, isPublished: p.isPublished },
    );
  };
  const e = form.formState.errors;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-cms'] });
  };
  return (
    <>
      <PageHeader
        title="CMS pages"
        description="About, Contact, Privacy, Terms, Returns and Shipping policies. Written in Markdown."
        actions={
          <Button onClick={() => open('new')}>
            <Plus /> New page
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(pages ?? []).map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p.title}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  /p/{p.slug} · updated {formatDate(p.updatedAt)}
                </p>
              </div>
              {!p.isPublished && <Badge variant="muted">Draft</Badge>}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit ${p.title}`}
                onClick={() => open(p)}
              >
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{edit === 'new' ? 'New page' : 'Edit page'}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-4 lg:grid-cols-2"
            onSubmit={form.handleSubmit(async (v) => {
              try {
                if (edit === 'new') await api.admin.cms.create(v);
                else await api.admin.cms.update((edit as CmsPageDto).id, v);
                toast.success('Page saved');
                setEdit(null);
                refresh();
              } catch (err) {
                applyApiError(form, err);
              }
            })}
          >
            <div className="space-y-4">
              <Field label="Title" htmlFor="cms-t" error={e.title?.message} required>
                <Input id="cms-t" {...form.register('title')} />
              </Field>
              <Field
                label="Slug"
                htmlFor="cms-s"
                error={e.slug?.message}
                required
                hint="URL: /p/your-slug"
              >
                <Input id="cms-s" className="font-mono" {...form.register('slug')} />
              </Field>
              <Field label="Content (Markdown)" htmlFor="cms-c" error={e.content?.message} required>
                <Textarea
                  id="cms-c"
                  rows={14}
                  className="font-mono text-xs"
                  {...form.register('content')}
                />
              </Field>
              <CheckRow
                id="cms-p"
                checked={!!form.watch('isPublished')}
                onCheckedChange={(v) => form.setValue('isPublished', v)}
              >
                Published
              </CheckRow>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Save page
              </Button>
            </div>
            <div className="max-h-[60dvh] overflow-auto rounded-xl border bg-background p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              <div className="prose-gk">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content || '*Nothing yet*'}
                </ReactMarkdown>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── audit logs ─────────────────────────
export function AuditAdmin() {
  const [open, setOpen] = useState<AuditLogDto | null>(null);
  const columns: ColumnDef<AuditLogDto>[] = [
    {
      accessorKey: 'createdAt',
      header: 'When',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      cell: ({ row: { original: l } }) =>
        l.actor ? (
          <div>
            <p className="font-semibold">{l.actor.name}</p>
            <Badge variant="muted">{l.actor.role}</Badge>
          </div>
        ) : (
          <span className="text-muted-foreground">System</span>
        ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
          {row.original.action}
        </code>
      ),
    },
    {
      id: 'entity',
      header: 'Entity',
      cell: ({ row: { original: l } }) => (
        <div className="text-xs">
          <p className="font-medium">{l.entityType}</p>
          <p className="font-mono text-muted-foreground">{l.entityId ?? ''}</p>
        </div>
      ),
    },
    {
      accessorKey: 'ip',
      header: 'IP',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.ip ?? ''}</span>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Audit logs"
        description="An append-only trail of sensitive admin and seller actions."
      />
      <ServerTable<AuditLogDto>
        queryKey="admin-audit"
        fetcher={(p) => api.admin.auditLogs(p)}
        columns={columns}
        searchPlaceholder="Search action, entity id, actor…"
        onRowClick={setOpen}
        filters={[
          {
            key: 'entityType',
            label: 'Entity',
            options: [
              'Product',
              'SellerProfile',
              'Order',
              'Coupon',
              'Category',
              'Brand',
              'CommissionRule',
              'Payout',
              'ReturnRequest',
              'User',
              'SiteSetting',
              'CmsPage',
              'Banner',
            ].map((s) => ({ value: s, label: s })),
          },
        ]}
      />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{open?.action}</DialogTitle>
            <DialogDescription>
              {open && `${open.actor?.name ?? 'System'} · ${formatDateTime(open.createdAt)}`}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50dvh] overflow-auto rounded-xl bg-muted p-4 text-xs">
            {JSON.stringify(open?.metadata ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── site settings ─────────────────────────
export function SettingsAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.admin.settings.get(),
  });
  const qc = useQueryClient();
  if (isLoading || !data) return <Skeleton className="h-96" />;
  return (
    <SettingsForm
      initial={data}
      onSaved={() => qc.invalidateQueries({ queryKey: ['admin-settings'] })}
    />
  );
}

function SettingsForm({
  initial,
  onSaved,
}: {
  initial: NonNullable<Awaited<ReturnType<typeof api.admin.settings.get>>>;
  onSaved: () => void;
}) {
  const form = useZodForm(siteSettingsSchema, { defaultValues: initial });
  const e = form.formState.errors;
  const num = { valueAsNumber: true } as const;
  return (
    <>
      <PageHeader
        title="Site settings"
        description="Delivery fees, COD rules, commission defaults and payout timing."
      />
      <form
        noValidate
        className="grid gap-5 lg:grid-cols-2"
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await api.admin.settings.update(v);
            toast.success('Settings saved');
            onSaved();
          } catch (err) {
            applyApiError(form, err);
          }
        })}
      >
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
            <CardDescription>Applied to every order at checkout.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery fee ₹" htmlFor="df" error={e.deliveryFee?.message}>
              <Input id="df" type="number" min={0} {...form.register('deliveryFee', num)} />
            </Field>
            <Field
              label="Free delivery above ₹"
              htmlFor="fd"
              error={e.freeDeliveryThreshold?.message}
              hint="0 disables free delivery"
            >
              <Input
                id="fd"
                type="number"
                min={0}
                {...form.register('freeDeliveryThreshold', num)}
              />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cash on Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CheckRow
              id="cod"
              checked={!!form.watch('codEnabled')}
              onCheckedChange={(v) => form.setValue('codEnabled', v)}
            >
              Enable COD
            </CheckRow>
            <CheckRow
              id="online"
              checked={!!form.watch('onlinePaymentsEnabled')}
              onCheckedChange={(v) => form.setValue('onlinePaymentsEnabled', v)}
            >
              Enable online payment (Razorpay). Turn off for a cash-only store.
            </CheckRow>
            <Field label="Maximum COD order ₹" htmlFor="cm" error={e.codMaxAmount?.message}>
              <Input id="cm" type="number" min={0} {...form.register('codMaxAmount', num)} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Marketplace</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Default commission %"
              htmlFor="dc"
              error={e.defaultCommissionRate?.message}
            >
              <Input
                id="dc"
                type="number"
                step="0.1"
                min={0}
                {...form.register('defaultCommissionRate', num)}
              />
            </Field>
            <Field
              label="Payout hold (days)"
              htmlFor="ph"
              error={e.payoutHoldDays?.message}
              hint="After delivery"
            >
              <Input id="ph" type="number" min={0} {...form.register('payoutHoldDays', num)} />
            </Field>
            <Field label="Low-stock alert at" htmlFor="ls" error={e.lowStockThreshold?.message}>
              <Input id="ls" type="number" min={0} {...form.register('lowStockThreshold', num)} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Support contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="se" error={e.supportEmail?.message}>
              <Input id="se" type="email" {...form.register('supportEmail')} />
            </Field>
            <Field label="Phone" htmlFor="sp" error={e.supportPhone?.message}>
              <Input id="sp" {...form.register('supportPhone')} />
            </Field>
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            Save settings
          </Button>
        </div>
      </form>
      <PincodesAdmin />
    </>
  );
}
