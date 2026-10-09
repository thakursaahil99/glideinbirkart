import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/layout/auth-shell';
import { VerifyEmail } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'Verify email', robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Email verification">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthShell>
  );
}
