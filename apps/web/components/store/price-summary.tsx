import { Truck } from 'lucide-react';
import type { PricingBreakdown } from '@gk/types';
import { formatINR } from '@gk/utils';
import { Progress } from '@/components/ui/data';
import { cn } from '@/lib/utils';

function Row({
  label,
  value,
  className,
  bold,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
  bold?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 text-sm',
        bold && 'text-base font-extrabold',
        className,
      )}
    >
      <dt className={cn(!bold && 'text-muted-foreground')}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Subtotal → discounts → delivery → GST (included) → total. Same breakdown in cart, checkout and orders. */
export function PriceSummary({
  pricing,
  itemCount,
  showFreeDeliveryProgress = true,
  className,
}: {
  pricing: PricingBreakdown;
  itemCount?: number;
  showFreeDeliveryProgress?: boolean;
  className?: string;
}) {
  const progress =
    pricing.freeDeliveryThreshold > 0
      ? Math.min(
          100,
          ((pricing.subtotal - pricing.couponDiscount) / pricing.freeDeliveryThreshold) * 100,
        )
      : 100;
  return (
    <div className={className}>
      {showFreeDeliveryProgress && pricing.freeDeliveryThreshold > 0 && pricing.subtotal > 0 && (
        <div className="mb-4 rounded-xl bg-secondary/60 p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <Truck className="size-4 text-primary" />
            {pricing.amountForFreeDelivery > 0 ? (
              <>
                Add <b className="text-primary">{formatINR(pricing.amountForFreeDelivery)}</b> more
                for free delivery
              </>
            ) : (
              <span className="text-success">You’ve unlocked free delivery 🎉</span>
            )}
          </p>
          <Progress
            value={progress}
            className="h-1.5"
            indicatorClassName={pricing.amountForFreeDelivery > 0 ? 'bg-accent' : 'bg-success'}
          />
        </div>
      )}
      <dl className="space-y-2.5">
        <Row
          label={`Price${itemCount ? ` (${itemCount} ${itemCount === 1 ? 'item' : 'items'})` : ''}`}
          value={formatINR(pricing.mrpTotal, true)}
        />
        {pricing.productDiscount > 0 && (
          <Row
            label="Discount"
            value={
              <span className="font-semibold text-success">
                − {formatINR(pricing.productDiscount, true)}
              </span>
            }
          />
        )}
        {pricing.couponDiscount > 0 && (
          <Row
            label="Coupon"
            value={
              <span className="font-semibold text-success">
                − {formatINR(pricing.couponDiscount, true)}
              </span>
            }
          />
        )}
        <Row
          label="Delivery charges"
          value={
            pricing.deliveryFee > 0 ? (
              formatINR(pricing.deliveryFee, true)
            ) : (
              <span className="font-semibold text-success">FREE</span>
            )
          }
        />
        <div className="border-t border-dashed pt-3">
          <Row bold label="Total amount" value={formatINR(pricing.total, true)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Includes {formatINR(pricing.gstTotal, true)} GST
        </p>
        {pricing.savings > 0 && (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-bold text-success">
            You will save {formatINR(pricing.savings, true)} on this order
          </p>
        )}
      </dl>
    </div>
  );
}
