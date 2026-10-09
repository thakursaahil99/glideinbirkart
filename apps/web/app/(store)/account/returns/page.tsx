import type { Metadata } from 'next';
import { ReturnsView } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'Returns & refunds', robots: { index: false } };
export default function Page() {
  return <ReturnsView />;
}
