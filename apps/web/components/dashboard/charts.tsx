'use client';

import { useId, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Table2, LineChart as LineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SeriesPoint {
  date: string;
  value: number;
}

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const compact = (n: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function ChartTooltip({
  active,
  payload,
  label,
  format,
  name,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  format: (n: number) => string;
  name: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lift">
      <p className="mb-0.5 font-semibold text-muted-foreground">{label ? shortDate(label) : ''}</p>
      <p className="font-bold text-foreground">
        {name}: {format(payload[0]?.value ?? 0)}
      </p>
    </div>
  );
}

/**
 * Single-series trend (area or bars) with a crosshair tooltip and a "table view" for accessibility.
 * One y-axis, recessive grid, thin marks; colour comes from the series token (--series-N).
 */
export function TrendChart({
  data,
  name,
  format,
  kind = 'area',
  series = 1,
  height = 260,
}: {
  data: SeriesPoint[];
  name: string;
  format: (n: number) => string;
  kind?: 'area' | 'bar';
  series?: 1 | 2 | 3;
  height?: number;
}) {
  const [table, setTable] = useState(false);
  const gid = useId().replace(/:/g, '');
  const color = `var(--series-${series})`;
  const empty = data.every((d) => d.value === 0);
  // thin the x ticks on long ranges
  const interval = Math.max(0, Math.ceil(data.length / 8) - 1);
  return (
    <div className="viz-root">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-pressed={table}
        >
          {table ? <LineIcon className="size-3.5" /> : <Table2 className="size-3.5" />}{' '}
          {table ? 'Chart view' : 'Table view'}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">{name} by day</caption>
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">{name}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-3 py-1.5">{shortDate(d.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{ height }}
          role="img"
          aria-label={`${name} over time chart. ${empty ? 'No data in this range.' : ''}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'area' ? (
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  interval={interval}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={compact}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
                />
                <Tooltip
                  content={<ChartTooltip format={format} name={name} />}
                  cursor={{ stroke: 'var(--viz-axis)', strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gid})`}
                  dot={false}
                  activeDot={{ r: 5, stroke: 'var(--surface-1)', strokeWidth: 2, fill: color }}
                />
              </AreaChart>
            ) : (
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="22%"
              >
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  interval={interval}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={compact}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  allowDecimals={false}
                  tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
                />
                <Tooltip
                  content={<ChartTooltip format={format} name={name} />}
                  cursor={{ fill: 'hsl(var(--muted) / 0.6)' }}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (top products / categories / sellers). One hue; value printed at the bar end. */
export function RankedBars({
  rows,
  format,
  series = 1,
  emptyText = 'No data in this range',
}: {
  rows: Array<{ label: string; value: number; sub?: string }>;
  format: (n: number) => string;
  series?: 1 | 2 | 3;
  emptyText?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="viz-root space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 tabular-nums font-bold">
              {format(r.value)}
              {r.sub && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.sub}</span>
              )}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((r.value / max) * 100, 2)}%`,
                background: `var(--series-${series})`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl border bg-card p-5 shadow-soft', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
