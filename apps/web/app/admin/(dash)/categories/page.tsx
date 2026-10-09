import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CategoryManager } from '@/components/admin/categories';

export const metadata: Metadata = { title: 'Categories', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <CategoryManager />
    </Suspense>
  );
}
