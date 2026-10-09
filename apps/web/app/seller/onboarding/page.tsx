import type { Metadata } from 'next';
import { OnboardingWizard } from '@/components/seller/onboarding';
import { RequireAuth } from '@/components/layout/require-auth';

export const metadata: Metadata = { title: 'Sell on Glideinbir Kart', robots: { index: false } };
export default function Page() {
  return (
    <RequireAuth roles={['CUSTOMER', 'SELLER']}>
      <div className="bg-paper min-h-dvh px-4 py-10 sm:py-16">
        <OnboardingWizard />
      </div>
    </RequireAuth>
  );
}
