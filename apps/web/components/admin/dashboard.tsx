'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  IndianRupee,
  Package,
  Percent,
  RotateCcw,
  ShoppingBag,
  Store,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton, StatusBadge } from '@/components/ui/data';
import { ChartCard, RankedBars, TrendChart } from '@/components/dashboard/charts';
import {
  DateRange,
  inr,
  PageHeader,
  rangeForDays,
  StatCard,
  type Range,
} from '@/components/dashboard/common';

export function AdminDashboard() {
  const [range, setRange] = useState<Range>(rangeForDays(30));
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard', range],
    queryFn: () => api.admin.dashboard(range),
  });
  const k = data?.kpis;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Marketplace performance at a glance."
        actions={<DateRange value={range} onChange={setRange} />}
      />
      {isLoading || !k ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="GMV"
              value={inr(k.gmv)}
              icon={IndianRupee}
              hint="gross merchandise value"
            />
            <StatCard
              label="Orders"
              value={k.orders.toLocaleString('en-IN')}
              icon={ShoppingBag}
              tone="accent"
            />
            <StatCard
              label="Average order value"
              value={inr(k.averageOrderValue)}
              icon={Percent}
              tone="success"
            />
            <StatCard
              label="Commission earned"
              value={inr(k.commissionEarned)}
              icon={IndianRupee}
              tone="deal"
              hint="platform revenue"
            />
            <StatCard
              label="New customers"
              value={k.newUsers.toLocaleString('en-IN')}
              icon={UserPlus}
              hint="signed up in range"
            />
            <StatCard label="Active sellers" value={k.activeSellers} icon={Store} tone="success" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                href: '/admin/sellers?status=PENDING',
                n: k.pendingSellers,
                label: 'seller applications to review',
                icon: Users,
              },
              {
                href: '/admin/products',
                n: k.pendingProducts,
                label: 'products awaiting moderation',
                icon: Package,
              },
              {
                href: '/admin/returns',
                n: k.openReturns,
                label: 'open returns & disputes',
                icon: RotateCcw,
              },
            ].map(({ href, n, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="grid size-11 place-content-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-display text-2xl font-extrabold leading-none">{n}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Gross merchandise value"
          description="Daily GMV (excludes cancelled & unpaid orders)"
        >
          {data ? (
            <TrendChart
              data={data.series.map((s) => ({ date: s.date, value: s.gmv }))}
              name="GMV"
              format={inr}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </ChartCard>
        <ChartCard title="Orders" description="Orders placed per day">
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
        <ChartCard title="New customers" description="Sign-ups per day">
          {data ? (
            <TrendChart
              data={data.series.map((s) => ({ date: s.date, value: s.users }))}
              name="New customers"
              format={(n) => String(n)}
              kind="bar"
              series={3}
              height={220}
            />
          ) : (
            <Skeleton className="h-52" />
          )}
        </ChartCard>
        <ChartCard title="Order status" description="Orders created in this range">
          <ul className="space-y-2.5">
            {(data?.orderStatus ?? []).map((s) => {
              const total = data!.orderStatus.reduce((n, x) => n + x.count, 0) || 1;
              return (
                <li key={s.status} className="flex items-center gap-3 text-sm">
                  <StatusBadge status={s.status} className="w-32 justify-center" />
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
          </ul>
        </ChartCard>
        <ChartCard title="Top categories" description="Revenue by department">
          <RankedBars
            rows={(data?.topCategories ?? []).map((c) => ({ label: c.name, value: c.revenue }))}
            format={inr}
          />
        </ChartCard>
        <ChartCard title="Top sellers" description="Revenue in this range">
          <RankedBars
            rows={(data?.topSellers ?? []).map((s) => ({
              label: s.storeName,
              value: s.revenue,
              sub: `${s.orders} orders`,
            }))}
            format={inr}
            series={3}
          />
        </ChartCard>
      </div>
    </>
  );
}
