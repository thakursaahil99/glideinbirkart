import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BannersAdmin } from '@/components/admin/crud';

export const metadata: Metadata = { title: 'Banners', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <BannersAdmin />
    </Suspense>
  );
}
