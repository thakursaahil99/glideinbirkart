'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { errMsg } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'primary',
  delta,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'primary' | 'accent' | 'success' | 'deal';
  delta?: number;
}) {
  const toneCls = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/25 text-[hsl(32_90%_28%)] dark:text-accent',
    success: 'bg-success/12 text-success',
    deal: 'bg-deal/12 text-deal',
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('grid size-9 place-content-center rounded-xl', toneCls)}>
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-[1.85rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {delta !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-bold',
              delta >= 0 ? 'text-success' : 'text-destructive',
            )}
          >
            {delta >= 0 ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
        {hint}
      </div>
    </div>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
];

export interface Range {
  from: string;
  to: string;
}
export const rangeForDays = (days: number): Range => ({
  from: iso(new Date(Date.now() - (days - 1) * 86_400_000)),
  to: iso(new Date()),
});

/** Preset chips + custom from/to — the single filter row above the charts. */
export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const active = PRESETS.find(
    (p) => JSON.stringify(rangeForDays(p.days)) === JSON.stringify(value),
  );
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      <div className="inline-flex rounded-xl bg-muted p-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(rangeForDays(p.days))}
            aria-pressed={active?.label === p.label}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
              active?.label === p.label
                ? 'bg-card shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <Input
          type="date"
          aria-label="From date"
          value={value.from}
          max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
          className="h-9 w-[8.6rem] text-xs"
        />
        <span className="text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To date"
          value={value.to}
          min={value.from}
          max={iso(new Date())}
          onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
          className="h-9 w-[8.6rem] text-xs"
        />
      </div>
    </div>
  );
}

/** Confirmation with an optional required reason (reject / cancel / block flows). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  requireReason = true,
  minLength = 3,
  label = 'Reason',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  minLength?: number;
  label?: string;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = !requireReason || reason.trim().length >= minLength;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReason('');
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {(requireReason || label) && (
          <Field label={label} htmlFor="reason-input" required={requireReason}>
            <Textarea
              id="reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Type here…"
              autoFocus
            />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!valid}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                onOpenChange(false);
                setReason('');
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
