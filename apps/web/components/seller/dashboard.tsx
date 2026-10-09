'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardList,
  Eye,
  IndianRupee,
  Package,
  Percent,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton, StatusBadge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { ChartCard, RankedBars, TrendChart } from '@/components/dashboard/charts';
import {
  DateRange,
  inr,
  PageHeader,
  rangeForDays,
  StatCard,
  type Range,
} from '@/components/dashboard/common';

export function SellerDashboard({ analyticsOnly }: { analyticsOnly?: boolean }) {
  const [range, setRange] = useState<Range>(rangeForDays(30));
  const { data, isLoading } = useQuery({
    queryKey: ['seller-analytics', range],
    queryFn: () => api.seller.analytics(range),
  });
  const { data: balance } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.seller.payouts.balance(),
    enabled: !analyticsOnly,
  });
  const { data: pending } = useQuery({
    queryKey: ['seller-pending-orders'],
    queryFn: () => api.seller.orders.list({ status: 'PENDING', limit: 1 }),
    enabled: !analyticsOnly,
  });
  const { data: low } = useQuery({
    queryKey: ['seller-low-stock'],
    queryFn: () => api.seller.inventory.list({ low: true, limit: 1 }),
    enabled: !analyticsOnly,
  });
  const t = data?.totals;

  return (
    <>
      <PageHeader
        title={analyticsOnly ? 'Analytics' : 'Dashboard'}
        description="Revenue, orders and product performance for your store."
        actions={<DateRange value={range} onChange={setRange} />}
      />

      {!analyticsOnly && (pending?.meta.total || low?.meta.lowStockCount) ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {!!pending?.meta.total && (
            <Link
              href="/seller/orders?status=PENDING"
              className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 transition hover:shadow-soft"
            >
              <ClipboardList className="size-6 text-warning" />
              <div className="flex-1 text-sm">
                <b>
                  {pending.meta.total} new {pending.meta.total === 1 ? 'order' : 'orders'}
                </b>{' '}
                waiting for you to accept
              </div>
              <Button size="sm">Review</Button>
            </Link>
          )}
          {!!low?.meta.lowStockCount && (
            <Link
              href="/seller/inventory?low=true"
              className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 transition hover:shadow-soft"
            >
              <AlertTriangle className="size-6 text-destructive" />
              <div className="flex-1 text-sm">
                <b>{low.meta.lowStockCount} SKUs</b> are low or out of stock
              </div>
              <Button size="sm" variant="outline">
                Restock
              </Button>
            </Link>
          )}
        </div>
      ) : null}

      {isLoading || !t ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Revenue"
            value={inr(t.revenue)}
            icon={IndianRupee}
            hint="in selected range"
          />
          <StatCard
            label="Orders"
            value={t.orders.toLocaleString('en-IN')}
            icon={ShoppingBag}
            tone="accent"
            hint={`${t.unitsSold} units sold`}
          />
          <StatCard
            label="Average order value"
            value={inr(t.averageOrderValue)}
            icon={Percent}
            tone="success"
          />
          <StatCard
            label="Product views"
            value={t.views.toLocaleString('en-IN')}
            icon={Eye}
            tone="deal"
            hint={`${t.conversionRate}% conversion · ${t.returns} returns`}
          />
        </div>
      )}

      {!analyticsOnly && balance && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Available for payout"
            value={inr(balance.pending)}
            icon={Wallet}
            tone="success"
            hint="past the return window"
          />
          <StatCard
            label="On hold"
            value={inr(balance.onHold)}
            icon={Package}
            tone="accent"
            hint="inside the return window"
          />
          <StatCard
            label="Settled to bank"
            value={inr(balance.settled)}
            icon={IndianRupee}
            hint={`${inr(balance.commissionPaid)} commission paid`}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Revenue" description="Daily sales value (incl. GST) from your orders">
          {data ? (
            <TrendChart
              data={data.series.map((s) => ({ date: s.date, value: s.revenue }))}
              name="Revenue"
              format={inr}
              series={1}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </ChartCard>
        <ChartCard title="Orders" description="Orders received per day">
          {data ? (
            <TrendChart
              data={data.series.map((s) => ({ date: s.date, value: s.orders }))}
              name="Orders"
              format={(n) => String(n)}
              kind="bar"
              series={2}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </ChartCard>
        <ChartCard title="Top products" description="By revenue in this range">
          <RankedBars
            rows={(data?.topProducts ?? []).map((p) => ({
              label: p.name,
              value: p.revenue,
              sub: `${p.units} sold`,
            }))}
            format={inr}
          />
        </ChartCard>
        <ChartCard title="Order status mix" description="All orders created in this range">
          <ul className="space-y-2.5">
            {(data?.statusBreakdown ?? []).map((s) => {
              const total = data!.statusBreakdown.reduce((n, x) => n + x.count, 0) || 1;
              return (
                <li key={s.status} className="flex items-center gap-3 text-sm">
                  <StatusBadge status={s.status} className="w-24 justify-center" />
                  <div className="viz-root h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.count / total) * 100}%`,
                        background: 'var(--series-1)',
                      }}
                    />
                  </div>
                  <span className="w-10 text-right font-bold tabular-nums">{s.count}</span>
                </li>
              );
            })}
            {data && data.statusBreakdown.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No orders in this range
              </p>
            )}
          </ul>
        </ChartCard>
      </div>
    </>
  );
}
