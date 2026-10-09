import type { Metadata } from 'next';
import { ProductForm } from '@/components/seller/product-form';

export const metadata: Metadata = { title: 'Edit product', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductForm productId={id} />;
}
