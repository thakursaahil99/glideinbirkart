'use client';

import Link from 'next/link';
import { Img } from '@/components/ui/img';
import { useSiteBrand } from '@/components/site-theme';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  const { logoUrl, siteName } = useSiteBrand();
  if (logoUrl) {
    return (
      <span className={cn('relative block size-9 shrink-0 overflow-hidden rounded-xl', className)}>
        <Img src={logoUrl} alt={siteName} fill sizes="64px" className="object-contain" />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <path
        d="M18 40c0-8 5-14 13-14h15l-3 8H32c-3 0-5 2-5 6s2 6 5 6h6v-4h-5l2-6h11l-3 16H33c-9 0-15-4-15-12z"
        fill="#fff"
      />
      <circle cx="48" cy="18" r="6" className="fill-accent" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const { siteName } = useSiteBrand();
  // last word picks up the primary colour, as in the original "Glideinbir Kart." wordmark
  const words = siteName.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  return (
    <Link
      href="/"
      className={cn('group flex items-center gap-2.5', className)}
      aria-label={`${siteName} home`}
    >
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      {!compact && (
        <span className="font-display text-[1.35rem] font-extrabold leading-none tracking-tight">
          {words.join(' ')}
          {last && <span className="text-primary"> {last}</span>}
          <span className="text-accent">.</span>
        </span>
      )}
    </Link>
  );
}
