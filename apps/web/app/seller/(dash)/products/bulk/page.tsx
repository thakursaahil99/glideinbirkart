import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BulkUpload } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Bulk upload', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <BulkUpload />
    </Suspense>
  );
}
