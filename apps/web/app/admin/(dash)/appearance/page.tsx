import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppearanceAdmin } from '@/components/admin/appearance';

export const metadata: Metadata = { title: 'Appearance', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <AppearanceAdmin />
    </Suspense>
  );
}
