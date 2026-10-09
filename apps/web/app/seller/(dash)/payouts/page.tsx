import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerPayouts } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Payouts', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerPayouts />
    </Suspense>
  );
}
