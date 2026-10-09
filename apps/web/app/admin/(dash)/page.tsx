import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/admin/dashboard';

export const metadata: Metadata = { title: 'Admin dashboard', robots: { index: false } };
export default function Page() {
  return <AdminDashboard />;
}
