import type { Metadata } from 'next';
import { SellerOrderDetail } from '@/components/seller/order-detail';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SellerOrderDetail id={id} />;
}
