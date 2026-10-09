import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerOrdersTable } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Orders', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerOrdersTable />
    </Suspense>
  );
}
