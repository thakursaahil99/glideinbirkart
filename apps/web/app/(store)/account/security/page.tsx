import type { Metadata } from 'next';
import { SecurityView } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'Login & security', robots: { index: false } };
export default function Page() {
  return <SecurityView />;
}
