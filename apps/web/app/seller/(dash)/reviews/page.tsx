import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerReviews } from '@/components/seller/lists';

export const metadata: Metadata = { title: 'Reviews', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SellerReviews />
    </Suspense>
  );
}
