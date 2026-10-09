import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminSellersTable } from '@/components/admin/sellers';

export const metadata: Metadata = { title: 'Sellers', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <AdminSellersTable />
    </Suspense>
  );
}
