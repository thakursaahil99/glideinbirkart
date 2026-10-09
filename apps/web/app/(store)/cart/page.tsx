import type { Metadata } from 'next';
import { CartView } from '@/components/store/cart-view';

export const metadata: Metadata = { title: 'Shopping cart', robots: { index: false } };

export default function CartPage() {
  return <CartView />;
}
