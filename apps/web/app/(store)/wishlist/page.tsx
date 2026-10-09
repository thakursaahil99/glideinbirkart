import type { Metadata } from 'next';
import { WishlistView } from '@/components/store/account-views';

export const metadata: Metadata = { title: 'My wishlist', robots: { index: false } };
export default function Page() {
  return (
    <div className="container-page py-6 sm:py-10">
      <WishlistView />
    </div>
  );
}
