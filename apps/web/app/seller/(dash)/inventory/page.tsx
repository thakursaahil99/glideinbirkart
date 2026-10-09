import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerInventoryTable } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Inventory', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerInventoryTable />
    </Suspense>
  );
}
