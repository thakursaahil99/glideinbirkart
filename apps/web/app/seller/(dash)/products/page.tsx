import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerProductsTable } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Products', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerProductsTable />
    </Suspense>
  );
}
