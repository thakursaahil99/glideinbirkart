import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerSettings } from '@/components/seller/settings';

export const metadata: Metadata = { title: 'Store settings', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerSettings />
    </Suspense>
  );
}
