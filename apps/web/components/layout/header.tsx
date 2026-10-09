'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  Heart,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Package,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  Sun,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CategoryDto } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { isStaff, useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { Logo } from './logo';
import { SearchBox } from './search-box';

const OFFERS = [
  '🚚 Free delivery on orders above ₹499',
  '⚡ Use WELCOME10 for 10% off your first order',
  '🔁 7-day easy returns on eligible items',
  '🔒 100% secure payments · UPI · Cards · COD',
  '🧾 GST invoice on every order',
];

function Announcement() {
  return (
    <div
      className="overflow-hidden bg-foreground py-1.5 text-[12.5px] font-medium text-background"
      aria-label="Offers"
    >
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap hover:[animation-play-state:paused]">
        {[...OFFERS, ...OFFERS, ...OFFERS, ...OFFERS].map((o, i) => (
          <span key={i} aria-hidden={i >= OFFERS.length}>
            {o}
          </span>
        ))}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

function UserMenu() {
  const { status, user, clear } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = usePathname();

  if (status === 'loading') return <div className="skeleton size-10 rounded-full" />;
  if (status !== 'authed' || !user) {
    return (
      <Button asChild variant="default" size="sm" className="rounded-full max-sm:size-9 max-sm:p-0">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} aria-label="Sign in">
          <User /> <span className="max-sm:sr-only">Sign in</span>
        </Link>
      </Button>
    );
  }
  const logout = async () => {
    await api.auth.logout().catch(() => undefined);
    clear();
    qc.clear();
    toast.success('Signed out');
    router.push('/');
    router.refresh();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm font-semibold transition hover:bg-muted"
          aria-label="Account menu"
        >
          <Avatar name={user.name} src={user.avatarUrl} className="size-8" />
          <span className="hidden max-w-[7rem] truncate lg:inline">{user.name.split(' ')[0]}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email ?? user.phone}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User /> My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/orders">
            <Package /> Orders
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/wishlist">
            <Heart /> Wishlist
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/addresses">
            <MapPin /> Addresses
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/returns">
            <RotateCcw /> Returns
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user.role === 'SELLER' && (
          <DropdownMenuItem asChild>
            <Link href="/seller">
              <Store /> Seller dashboard
            </Link>
          </DropdownMenuItem>
        )}
        {user.role === 'CUSTOMER' && (
          <DropdownMenuItem asChild>
            <Link href="/seller/onboarding">
              <Store /> Sell on Glideinbir
            </Link>
          </DropdownMenuItem>
        )}
        {isStaff(user.role) && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck /> Admin panel
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem destructive onSelect={logout}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CartButton() {
  const { data } = hooks.useCart();
  const count = data?.itemCount ?? 0;
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={`Cart, ${count} items`}
    >
      <Link href="/cart">
        <ShoppingCart className="size-5" />
        {count > 0 && (
          <span
            key={count}
            className="absolute -right-0.5 -top-0.5 grid min-w-[18px] animate-in zoom-in-50 place-content-center rounded-full bg-deal px-1 text-[10px] font-bold leading-[18px] text-deal-foreground"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
    </Button>
  );
}

function BellButton() {
  const status = useAuth((s) => s.status);
  const { data } = hooks.useUnreadCount({ enabled: status === 'authed' });
  if (status !== 'authed') return null;
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative hidden sm:inline-flex"
      aria-label="Notifications"
    >
      <Link href="/account/notifications">
        <Bell className="size-5" />
        {!!data?.count && (
          <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-deal ring-2 ring-background" />
        )}
      </Link>
    </Button>
  );
}

function MegaNav({ categories }: { categories: CategoryDto[] }) {
  return (
    <nav aria-label="Categories" className="hidden border-t lg:block">
      <ul className="container-page flex items-center gap-1">
        {categories.map((c) => (
          <li key={c.id} className="group static">
            <Link
              href={`/c/${c.slug}`}
              className="flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-[13.5px] font-semibold text-foreground/80 transition-colors hover:text-primary"
            >
              {c.name}
              {!!c.children?.length && (
                <ChevronDown className="size-3 opacity-50 transition-transform group-hover:rotate-180" />
              )}
            </Link>
            {!!c.children?.length && (
              <div className="invisible absolute inset-x-0 top-full z-40 translate-y-1 border-b bg-popover opacity-0 shadow-lift transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="container-page grid grid-cols-[1fr_16rem] gap-8 py-6">
                  <div className="grid grid-cols-3 gap-x-8 gap-y-5 xl:grid-cols-4">
                    {c.children.map((child) => (
                      <div key={child.id}>
                        <Link
                          href={`/c/${child.slug}`}
                          className="mb-1.5 block font-display text-sm font-bold hover:text-primary"
                        >
                          {child.name}
                        </Link>
                        <ul className="space-y-1">
                          {(child.children ?? []).map((g) => (
                            <li key={g.id}>
                              <Link
                                href={`/c/${g.slug}`}
                                className="text-sm text-muted-foreground transition-colors hover:text-primary"
                              >
                                {g.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/c/${c.slug}`}
                    className="group/card relative block overflow-hidden rounded-2xl bg-muted"
                  >
                    <Img
                      src={c.imageUrl}
                      alt={c.name}
                      width={400}
                      height={300}
                      className="size-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                    />
                  </Link>
                </div>
              </div>
            )}
          </li>
        ))}
        <li className="ml-auto">
          <Link
            href="/search?sort=discount"
            className="flex items-center gap-1.5 px-3 py-2.5 text-[13.5px] font-bold text-deal hover:underline"
          >
            Top deals
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export function Header({ categories }: { categories: CategoryDto[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
      <Announcement />
      <div className="container-page flex h-16 items-center gap-3 sm:gap-5">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Logo className="shrink-0" />
        <div className="mx-2 hidden max-w-2xl flex-1 md:block">
          <Suspense fallback={<div className="skeleton h-11 w-full rounded-full" />}>
            <SearchBox />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
          <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label="Search">
            <Link href="/search">
              <Search className="size-5" />
            </Link>
          </Button>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="Wishlist"
          >
            <Link href="/wishlist">
              <Heart className="size-5" />
            </Link>
          </Button>
          <BellButton />
          <CartButton />
          <UserMenu />
        </div>
      </div>
      <MegaNav categories={categories} />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="gap-0 overflow-y-auto p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex items-center justify-between border-b p-4">
            <Logo />
            <ThemeToggle />
          </div>
          <nav aria-label="Mobile categories" className="p-2">
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Shop by category
            </p>
            {categories.map((c) => (
              <details key={c.id} className="group rounded-xl open:bg-muted/50">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold hover:bg-muted">
                  {c.name}
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <ul className="pb-2 pl-3">
                  <li>
                    <Link
                      href={`/c/${c.slug}`}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-sm font-medium text-primary',
                        pathname === `/c/${c.slug}` && 'bg-muted',
                      )}
                    >
                      All {c.name}
                    </Link>
                  </li>
                  {(c.children ?? []).map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/c/${child.slug}`}
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </nav>
          <div className="mt-auto space-y-1 border-t p-4 text-sm">
            <Link
              href="/account/orders"
              onClick={() => setMenuOpen(false)}
              className="block py-1.5 font-medium"
            >
              My orders
            </Link>
            <Link
              href="/wishlist"
              onClick={() => setMenuOpen(false)}
              className="block py-1.5 font-medium"
            >
              Wishlist
            </Link>
            <Link
              href="/seller/onboarding"
              onClick={() => setMenuOpen(false)}
              className="block py-1.5 font-medium"
            >
              Sell on Glideinbir
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
