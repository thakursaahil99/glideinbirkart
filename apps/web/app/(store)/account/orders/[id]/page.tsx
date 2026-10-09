import type { Metadata } from 'next';
import { OrderDetailView } from '@/components/store/order-detail';

export const metadata: Metadata = { title: 'Order details', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailView id={id} />;
}
