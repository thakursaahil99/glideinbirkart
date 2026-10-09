import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerReturnsTable } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Returns', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerReturnsTable />
    </Suspense>
  );
}
