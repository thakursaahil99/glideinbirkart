'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgePercent,
  BellRing,
  BookOpenText,
  Boxes,
  ClipboardList,
  Image as ImageIcon,
  LayoutDashboard,
  ListTree,
  Package,
  RotateCcw,
  ScrollText,
  Palette,
  Settings,
  Store,
  Tags,
  TicketPercent,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { DashboardShell, type NavItem } from '@/components/dashboard/shell';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  // sidebar badges for the work queues
  const { data: stats } = useQuery({
    queryKey: ['admin-queues'],
    queryFn: async () => {
      const [sellers, products, returns] = await Promise.all([
        api.admin.sellers.list({ status: 'PENDING', limit: 1 }),
        api.admin.products.list({ status: 'PENDING_REVIEW', limit: 1 }),
        api.admin.returns.list({ status: 'ESCALATED', limit: 1 }),
      ]);
      return {
        sellers: sellers.meta.total,
        products: products.meta.total,
        disputes: returns.meta.total,
      };
    },
    refetchInterval: 60_000,
    enabled: status === 'authed',
  });
  const items: NavItem[] = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    {
      href: '/admin/sellers',
      label: 'Sellers',
      icon: Store,
      badge: stats?.sellers,
      group: 'Approvals',
    },
    {
      href: '/admin/products',
      label: 'Product moderation',
      icon: Package,
      badge: stats?.products,
      group: 'Approvals',
    },
    { href: '/admin/orders', label: 'Orders', icon: ClipboardList, group: 'Operations' },
    {
      href: '/admin/returns',
      label: 'Returns & disputes',
      icon: RotateCcw,
      badge: stats?.disputes,
      group: 'Operations',
    },
    { href: '/admin/payouts', label: 'Payouts', icon: Wallet, group: 'Operations' },
    { href: '/admin/users', label: 'Users', icon: Users, group: 'Operations' },
    { href: '/admin/categories', label: 'Categories', icon: ListTree, group: 'Catalogue' },
    { href: '/admin/brands', label: 'Brands', icon: Tags, group: 'Catalogue' },
    { href: '/admin/attributes', label: 'Attributes', icon: Boxes, group: 'Catalogue' },
    { href: '/admin/banners', label: 'Banners', icon: ImageIcon, group: 'Marketing' },
    { href: '/admin/coupons', label: 'Coupons', icon: TicketPercent, group: 'Marketing' },
    {
      href: '/admin/notifications',
      label: 'App notifications',
      icon: BellRing,
      group: 'Marketing',
    },
    { href: '/admin/commission', label: 'Commission', icon: BadgePercent, group: 'Settings' },
    { href: '/admin/cms', label: 'CMS pages', icon: BookOpenText, group: 'Settings' },
    { href: '/admin/appearance', label: 'Appearance', icon: Palette, group: 'Settings' },
    { href: '/admin/settings', label: 'Site settings', icon: Settings, group: 'Settings' },
    { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText, group: 'Settings' },
  ];
  return (
    <DashboardShell title="Admin Panel" roles={['ADMIN']} items={items}>
      {children}
    </DashboardShell>
  );
}
