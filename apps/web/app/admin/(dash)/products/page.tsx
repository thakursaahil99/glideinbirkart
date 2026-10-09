import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminProducts } from '@/components/admin/products';

export const metadata: Metadata = { title: 'Product moderation', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <AdminProducts />
    </Suspense>
  );
}
