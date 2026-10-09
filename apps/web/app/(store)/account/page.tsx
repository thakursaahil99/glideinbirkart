import type { Metadata } from 'next';
import { ProfileView } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'My profile', robots: { index: false } };
export default function Page() {
  return <ProfileView />;
}
