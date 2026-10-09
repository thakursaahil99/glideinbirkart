import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BroadcastAdmin } from '@/components/admin/broadcast';

export const metadata: Metadata = { title: 'App notifications', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <BroadcastAdmin />
    </Suspense>
  );
}
