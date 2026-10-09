import type { Metadata } from 'next';
import { ProductForm } from '@/components/seller/product-form';

export const metadata: Metadata = { title: 'Add product', robots: { index: false } };
export default function Page() {
  return <ProductForm />;
}
