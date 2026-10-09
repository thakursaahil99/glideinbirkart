import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrdersAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Orders', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <OrdersAdmin />
    </Suspense>
  );
}
