import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BrandsAdmin } from '@/components/admin/crud';

export const metadata: Metadata = { title: 'Brands', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <BrandsAdmin />
    </Suspense>
  );
}
