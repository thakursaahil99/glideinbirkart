import type { Metadata } from 'next';
import { OrdersList } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'My orders', robots: { index: false } };
export default function Page() {
  return <OrdersList />;
}
