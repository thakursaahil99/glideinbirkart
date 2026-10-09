import type { Metadata } from 'next';
import { CheckoutView } from '@/components/store/checkout-view';
import { RequireAuth } from '@/components/layout/require-auth';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <CheckoutView />
    </RequireAuth>
  );
}
