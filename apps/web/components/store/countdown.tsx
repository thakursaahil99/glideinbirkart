'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live countdown to `endsAt`. Renders a stable placeholder on the server to avoid hydration mismatch. */
export function Countdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(new Date(endsAt).getTime() - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  const p = parts(left ?? 0);
  const box = (v: number, label: string) => (
    <div className="text-center">
      <div className="grid h-11 w-12 place-content-center rounded-xl bg-white/10 font-display text-xl font-extrabold tabular-nums text-white ring-1 ring-white/15 backdrop-blur sm:h-12 sm:w-14 sm:text-2xl">
        {left === null ? '--' : String(v).padStart(2, '0')}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
        {label}
      </div>
    </div>
  );
  return (
    <div
      className={cn('flex items-center gap-2.5', className)}
      role="timer"
      aria-label={
        left === null ? 'Deal countdown' : `Deal ends in ${p.h} hours ${p.m} minutes ${p.s} seconds`
      }
    >
      <Timer className="mr-1 hidden size-5 text-accent sm:block" aria-hidden />
      {box(p.h, 'Hrs')}
      <span className="-mt-4 font-bold text-accent">:</span>
      {box(p.m, 'Min')}
      <span className="-mt-4 font-bold text-accent">:</span>
      {box(p.s, 'Sec')}
    </div>
  );
}
