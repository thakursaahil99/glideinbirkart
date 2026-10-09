import type { Metadata } from 'next';
import { SellerDashboard } from '@/components/seller/dashboard';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false } };
export default function Page() {
  return <SellerDashboard analyticsOnly />;
}
