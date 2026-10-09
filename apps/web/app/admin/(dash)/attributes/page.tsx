import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttributesAdmin } from '@/components/admin/crud';

export const metadata: Metadata = { title: 'Attributes', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <AttributesAdmin />
    </Suspense>
  );
}
