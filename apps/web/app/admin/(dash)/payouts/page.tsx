import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PayoutsAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Payouts', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <PayoutsAdmin />
    </Suspense>
  );
}
