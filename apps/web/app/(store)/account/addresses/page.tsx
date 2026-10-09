import type { Metadata } from 'next';
import { AddressBook } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'Saved addresses', robots: { index: false } };
export default function Page() {
  return <AddressBook />;
}
