import { Star } from 'lucide-react';
import { formatINR } from '@gk/utils';
import { cn } from '@/lib/utils';

export function Price({
  price,
  mrp,
  discountPercent,
  size = 'md',
  className,
  showGst,
}: {
  price: number;
  mrp?: number;
  discountPercent?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showGst?: boolean;
}) {
  const off = discountPercent ?? (mrp && mrp > price ? Math.floor(((mrp - price) / mrp) * 100) : 0);
  const main = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl', xl: 'text-3xl sm:text-4xl' }[size];
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className={cn('font-display font-extrabold tracking-tight', main)}>
        {formatINR(price)}
      </span>
      {mrp !== undefined && mrp > price && (
        <span className="text-sm text-muted-foreground line-through">{formatINR(mrp)}</span>
      )}
      {off > 0 && <span className="text-sm font-bold text-success">{off}% off</span>}
      {showGst && (
        <span className="w-full text-xs text-muted-foreground">Inclusive of all taxes (GST)</span>
      )}
    </div>
  );
}

export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star
              width={size}
              height={size}
              className="absolute inset-0 text-border"
              fill="currentColor"
              strokeWidth={0}
            />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star
                width={size}
                height={size}
                className="text-accent"
                fill="currentColor"
                strokeWidth={0}
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function RatingPill({
  value,
  count,
  className,
}: {
  value: number;
  count?: number;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-success px-1.5 py-0.5 text-xs font-bold text-success-foreground',
        className,
      )}
    >
      {value.toFixed(1)} <Star className="size-3" fill="currentColor" strokeWidth={0} />
      <span className="font-medium opacity-80">({count})</span>
    </span>
  );
}
