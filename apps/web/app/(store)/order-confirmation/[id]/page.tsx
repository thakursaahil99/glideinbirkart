import type { Metadata } from 'next';
import { ConfirmationView } from '@/components/store/account-views';
import { RequireAuth } from '@/components/layout/require-auth';

export const metadata: Metadata = { title: 'Order confirmation', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <ConfirmationView id={id} />
    </RequireAuth>
  );
}
