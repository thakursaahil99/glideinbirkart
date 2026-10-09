import type { Metadata } from 'next';
import { NotificationsView } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export default function Page() {
  return <NotificationsView />;
}
