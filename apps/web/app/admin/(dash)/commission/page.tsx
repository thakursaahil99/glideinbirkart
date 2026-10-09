import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CommissionAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Commission', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <CommissionAdmin />
    </Suspense>
  );
}
