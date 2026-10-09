import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerQuestions } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Questions', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerQuestions />
    </Suspense>
  );
}
