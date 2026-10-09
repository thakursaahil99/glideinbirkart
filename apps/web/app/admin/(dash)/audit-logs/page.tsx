import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditAdmin } from '@/components/admin/ops';

export const metadata: Metadata = { title: 'Audit logs', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <AuditAdmin />
    </Suspense>
  );
}
