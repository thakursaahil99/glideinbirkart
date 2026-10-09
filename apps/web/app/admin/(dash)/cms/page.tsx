import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CmsAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'CMS pages', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <CmsAdmin />
    </Suspense>
  );
}
