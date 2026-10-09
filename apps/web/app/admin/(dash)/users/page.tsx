import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UsersAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Users', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <UsersAdmin />
    </Suspense>
  );
}
