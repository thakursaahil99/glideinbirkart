'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LogOut, Menu, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@gk/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/overlay';
import { RequireAuth } from '@/components/layout/require-auth';
import { LogoMark } from '@/components/layout/logo';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  group?: string;
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const root = items[0]?.href ?? '';
  let lastGroup: string | undefined;
  return (
    <nav aria-label="Dashboard" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
      {items.map((item) => {
        const active = item.href === root ? pathname === root : pathname.startsWith(item.href);
        const showGroup = item.group && item.group !== lastGroup;
        lastGroup = item.group;
        const Icon = item.icon;
        return (
          <div key={item.href}>
            {showGroup && (
              <p className="px-3 pb-1 pt-4 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {item.group}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-foreground/75 hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {!!item.badge && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                    active ? 'bg-white/25' : 'bg-deal text-deal-foreground',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Sidebar dashboard layout shared by /seller and /admin. */
export function DashboardShell({
  title,
  roles,
  items,
  children,
  accent,
}: {
  title: string;
  roles: Role[];
  items: NavItem[];
  children: React.ReactNode;
  accent?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { user, clear } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const logout = async () => {
    await api.auth.logout().catch(() => undefined);
    clear();
    qc.clear();
    router.push('/');
  };

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-5 py-5" aria-label="Back to store">
      <LogoMark className="size-9" />
      <div className="leading-tight">
        <p className="font-display text-[15px] font-extrabold">Glideinbir Kart</p>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{title}</p>
      </div>
    </Link>
  );

  return (
    <RequireAuth roles={roles}>
      <div className="min-h-dvh bg-muted/40 lg:grid lg:grid-cols-[17rem_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
          {brand}
          <NavList items={items} />
          <div className="border-t p-3">
            <Button asChild variant="ghost" size="sm" className="w-full justify-between">
              <Link href="/">
                View storefront <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <p className="font-display text-lg font-extrabold lg:hidden">{title}</p>
            <div className="ml-auto flex items-center gap-2">
              {accent}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle dark mode"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="size-[18px]" />
                ) : (
                  <Moon className="size-[18px]" />
                )}
              </Button>
              {user && (
                <div className="flex items-center gap-2.5 rounded-full border bg-card py-1 pl-1 pr-3">
                  <Avatar name={user.name} src={user.avatarUrl} className="size-8" />
                  <div className="hidden text-xs leading-tight sm:block">
                    <p className="max-w-[9rem] truncate font-bold">{user.name}</p>
                    <p className="text-muted-foreground">{user.role.replace('_', ' ')}</p>
                  </div>
                </div>
              )}
              <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
                <LogOut className="size-[18px]" />
              </Button>
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="gap-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {brand}
            <NavList items={items} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </RequireAuth>
  );
}
