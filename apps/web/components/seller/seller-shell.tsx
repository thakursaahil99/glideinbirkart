'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  HelpCircle,
  LayoutDashboard,
  MessageSquareText,
  Package,
  RotateCcw,
  Settings,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardShell, type NavItem } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/data';

const NAV: NavItem[] = [
  { href: '/seller', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/seller/orders', label: 'Orders', icon: ClipboardList, group: 'Sell' },
  { href: '/seller/products', label: 'Products', icon: Package, group: 'Sell' },
  { href: '/seller/inventory', label: 'Inventory', icon: Boxes, group: 'Sell' },
  { href: '/seller/returns', label: 'Returns', icon: RotateCcw, group: 'Sell' },
  { href: '/seller/payouts', label: 'Payouts', icon: Wallet, group: 'Money' },
  { href: '/seller/analytics', label: 'Analytics', icon: BarChart3, group: 'Money' },
  { href: '/seller/reviews', label: 'Reviews', icon: MessageSquareText, group: 'Customers' },
  { href: '/seller/questions', label: 'Questions', icon: HelpCircle, group: 'Customers' },
  { href: '/seller/settings', label: 'Store settings', icon: Settings, group: 'Account' },
];

/** Non-approved sellers are routed back into onboarding / status instead of seeing an empty dashboard. */
function ApprovalGate({ children }: { children: React.ReactNode }) {
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['seller-profile'],
    queryFn: () => api.seller.profile(),
    staleTime: 60_000,
  });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !profile)
    return (
      <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
        Could not load your seller profile.
      </p>
    );
  if (profile.status !== 'APPROVED') {
    const copy = {
      DRAFT: [
        'Finish your seller application',
        'Complete your business details, bank account, pickup address and KYC documents to start selling.',
        'Continue application',
      ],
      PENDING: [
        'Application under review',
        'Our team is verifying your KYC documents. This usually takes 1–2 business days — we’ll email you the moment you’re approved.',
        'View application',
      ],
      REJECTED: [
        'Your application needs changes',
        profile.adminRemarks ?? 'Please review your details and resubmit.',
        'Update application',
      ],
      SUSPENDED: [
        'Your account is suspended',
        profile.adminRemarks ?? 'Please contact support for details.',
        'View details',
      ],
      APPROVED: ['', '', ''],
    }[profile.status];
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-3xl border bg-card p-8 text-center shadow-lift">
        <h1 className="font-display text-2xl font-extrabold">{copy[0]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy[1]}</p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/seller/onboarding">{copy[2]}</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function SellerShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell title="Seller Center" roles={['SELLER']} items={NAV}>
      <ApprovalGate>{children}</ApprovalGate>
    </DashboardShell>
  );
}
