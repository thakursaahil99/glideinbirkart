import { View } from 'react-native';
import type { PricingBreakdown } from '@gk/types';
import { formatINR } from '@/lib/format';
import { Divider, Row } from './ui';

export function PriceSummary({
  pricing,
  couponCode,
}: {
  pricing: PricingBreakdown;
  couponCode?: string | null;
}) {
  return (
    <View className="gap-0.5">
      <Row label="Price (MRP)" value={formatINR(pricing.mrpTotal, true)} />
      {pricing.productDiscount > 0 ? (
        <Row
          label="Discount"
          value={`-${formatINR(pricing.productDiscount, true)}`}
          tone="success"
        />
      ) : null}
      {pricing.couponDiscount > 0 ? (
        <Row
          label={couponCode ? `Coupon (${couponCode})` : 'Coupon'}
          value={`-${formatINR(pricing.couponDiscount, true)}`}
          tone="success"
        />
      ) : null}
      <Row
        label="Delivery"
        value={pricing.deliveryFee > 0 ? formatINR(pricing.deliveryFee, true) : 'FREE'}
        tone={pricing.deliveryFee > 0 ? undefined : 'success'}
      />
      <Divider className="my-2" />
      <Row label="Total" value={formatINR(pricing.total, true)} bold />
      <Row label="GST included" value={formatINR(pricing.gstTotal, true)} />
      {pricing.savings > 0 ? (
        <Row label="You save" value={formatINR(pricing.savings, true)} tone="success" />
      ) : null}
    </View>
  );
}
