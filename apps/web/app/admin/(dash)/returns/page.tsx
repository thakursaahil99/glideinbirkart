import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReturnsAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Returns & disputes', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <ReturnsAdmin />
    </Suspense>
  );
}
