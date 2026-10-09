import { SellerShell } from '@/components/seller/seller-shell';

export default function SellerDashLayout({ children }: { children: React.ReactNode }) {
  return <SellerShell>{children}</SellerShell>;
}
