import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Site settings', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <SettingsAdmin />
    </Suspense>
  );
}
