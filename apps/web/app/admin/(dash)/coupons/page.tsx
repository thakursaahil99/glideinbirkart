import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CouponsAdmin } from '@/components/admin/crud';

export const metadata: Metadata = { title: 'Coupons', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <CouponsAdmin />
    </Suspense>
  );
}
