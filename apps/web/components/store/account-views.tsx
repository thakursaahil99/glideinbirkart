'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  CircleCheck,
  Heart,
  KeyRound,
  LogOut,
  MapPin,
  MonitorSmartphone,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { updateProfileSchema, changePasswordSchema } from '@gk/validators';
import type { AddressDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { applyApiError, errMsg, useZodForm } from '@/lib/forms';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Img } from '@/components/ui/img';
import { AddressDialog } from './address-form';
import { ProductGrid } from './product-card';

const NAV = [
  { href: '/account', label: 'Profile', icon: User },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/returns', label: 'Returns', icon: RotateCcw },
  { href: '/account/notifications', label: 'Notifications', icon: Bell },
  { href: '/account/security', label: 'Security', icon: KeyRound },
];

export function AccountNav() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  return (
    <nav aria-label="Account" className="lg:sticky lg:top-36">
      <div className="mb-4 hidden rounded-2xl border bg-card p-4 shadow-soft lg:block">
        <p className="truncate font-display font-bold">{user?.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user?.email ?? user?.phone}</p>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/account' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-soft'
                    : 'bg-card text-foreground/80 hover:bg-muted lg:bg-transparent',
                )}
              >
                <Icon className="size-4" /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ProfileView() {
  const { user, setUser } = useAuth();
  const update = hooks.useUpdateProfile();
  const form = useZodForm(updateProfileSchema, {
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? undefined },
  });
  if (!user) return null;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">My profile</h1>
      {!user.emailVerified && user.email && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium">
            Verify your email <b>{user.email}</b> to secure your account and receive order updates.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              api.auth
                .resendVerification()
                .then((r) => toast.success(r.sent ? 'Verification email sent' : 'Already verified'))
                .catch((e) => toast.error(errMsg(e)))
            }
          >
            Resend email
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>Member since {formatDate(user.createdAt)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid max-w-xl gap-4"
            onSubmit={form.handleSubmit((v) =>
              update.mutate(v, {
                onSuccess: (u) => {
                  setUser(u);
                  toast.success('Profile updated');
                },
                onError: (e) => applyApiError(form, e),
              }),
            )}
          >
            <Field label="Full name" htmlFor="p-name" error={form.formState.errors.name?.message}>
              <Input id="p-name" {...form.register('name')} />
            </Field>
            <Field
              label="Email"
              htmlFor="p-email"
              hint={user.emailVerified ? 'Verified' : 'Not verified'}
            >
              <Input id="p-email" value={user.email ?? ''} disabled />
            </Field>
            <Field
              label="Mobile number"
              htmlFor="p-phone"
              error={form.formState.errors.phone?.message}
              hint={user.phoneVerified ? 'Verified via OTP' : undefined}
            >
              <Input
                id="p-phone"
                inputMode="numeric"
                placeholder="10-digit mobile"
                {...form.register('phone', { setValueAs: (v: string) => (v ? v : undefined) })}
              />
            </Field>
            <Button type="submit" className="w-fit" loading={update.isPending}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const ORDER_TABS = [
  ['', 'All'],
  ['PLACED', 'Placed'],
  ['PROCESSING', 'Processing'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
];

export function OrdersList() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = hooks.useOrders({
    page,
    limit: 8,
    status: status || undefined,
  });
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">My orders</h1>
      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      >
        <TabsList>
          {ORDER_TABS.map(([v, l]) => (
            <TabsTrigger key={v} value={v}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
            {data.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/account/orders/${o.id}`}
                  className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift sm:flex-row sm:items-center"
                >
                  <div className="flex -space-x-3">
                    {o.previewImages.slice(0, 3).map((src, i) => (
                      <span
                        key={i}
                        className="relative size-16 overflow-hidden rounded-xl border-2 border-card bg-muted"
                      >
                        <Img src={src} alt="" fill sizes="64px" className="object-cover" />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="flex flex-wrap items-center gap-2 font-bold"
                      data-testid="order-row"
                    >
                      {o.orderNumber} <StatusBadge status={o.status} />
                    </p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">
                      {o.firstItemName}
                      {o.itemCount > 1 ? ` + ${o.itemCount - 1} more` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Placed {formatDate(o.createdAt)} ·{' '}
                      {o.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Paid online'}
                    </p>
                  </div>
                  <p className="font-display text-lg font-extrabold">{formatINR(o.total, true)}</p>
                </Link>
              </li>
            ))}
          </ul>
          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.meta.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Package />}
          title="No orders yet"
          description="When you place an order it will show up here."
          action={
            <Button asChild>
              <Link href="/">Start shopping</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export function AddressBook() {
  const { data, isLoading } = hooks.useAddresses();
  const del = hooks.useDeleteAddress();
  const setDefault = hooks.useSetDefaultAddress();
  const [dialog, setDialog] = useState<{ open: boolean; address: AddressDto | null }>({
    open: false,
    address: null,
  });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Saved addresses</h1>
        <Button onClick={() => setDialog({ open: true, address: null })}>
          <Plus /> Add address
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : data && data.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.map((a) => (
            <li key={a.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-soft">
              <div className="mb-2 flex items-center gap-2">
                <b>{a.fullName}</b>
                <Badge variant="secondary">{a.type}</Badge>
                {a.isDefault && <Badge variant="accent">Default</Badge>}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}
                {a.landmark ? `, ${a.landmark}` : ''}
                <br />
                {a.city}, {a.state} – {a.pincode}
                <br />
                Phone: {a.phone}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                <button
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={() => setDialog({ open: true, address: a })}
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                {!a.isDefault && (
                  <button
                    className="text-primary hover:underline"
                    onClick={() =>
                      setDefault.mutate(a.id, {
                        onSuccess: () => toast.success('Default address updated'),
                      })
                    }
                  >
                    Set as default
                  </button>
                )}
                <button
                  className="ml-auto inline-flex items-center gap-1 text-destructive hover:underline"
                  onClick={() =>
                    del.mutate(a.id, {
                      onSuccess: () => toast.success('Address removed'),
                      onError: (e) => toast.error(errMsg(e)),
                    })
                  }
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<MapPin />}
          title="No saved addresses"
          description="Add an address for faster checkout."
        />
      )}
      {dialog.open && (
        <AddressDialog
          key={dialog.address?.id ?? 'new'}
          open
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          address={dialog.address}
        />
      )}
    </div>
  );
}

export function ReturnsView() {
  const { data, isLoading } = hooks.useReturns({ limit: 30 });
  const qc = useQueryClient();
  const escalate = async (id: string) => {
    try {
      await api.returns.escalate(id, 'Customer requests platform review');
      toast.success('Escalated to our team — we will review within 2 business days');
      void qc.invalidateQueries({ queryKey: ['returns'] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Returns & refunds</h1>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : data && data.items.length > 0 ? (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:flex-row"
            >
              <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                <Img src={r.itemImage} alt="" fill sizes="64px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <span className="line-clamp-1">{r.itemName}</span>{' '}
                  <StatusBadge status={r.status} />
                </p>
                <p className="text-muted-foreground">
                  Order {r.orderNumber} · Qty {r.quantity} · {r.reason}
                </p>
                {r.sellerRemarks && (
                  <p className="mt-1 text-muted-foreground">Seller: “{r.sellerRemarks}”</p>
                )}
                {r.adminRemarks && (
                  <p className="text-muted-foreground">Our team: “{r.adminRemarks}”</p>
                )}
                {r.refundAmount != null && (
                  <p className="mt-1 font-semibold text-success">
                    Refund: {formatINR(r.refundAmount, true)}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Requested {formatDateTime(r.createdAt)}
                </p>
              </div>
              {r.status === 'REJECTED' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => escalate(r.id)}
                >
                  Escalate to Glideinbir
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<RotateCcw />}
          title="No return requests"
          description="Need to return something? Open a delivered order and choose Return."
          action={
            <Button asChild variant="outline">
              <Link href="/account/orders">View orders</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export function NotificationsView() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = hooks.useNotifications({ page, limit: 15 });
  const read = hooks.useMarkNotificationRead();
  const readAll = hooks.useMarkAllRead();
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Notifications</h1>
        {!!data?.meta.unread && (
          <Button variant="outline" size="sm" onClick={() => readAll.mutate()}>
            <CheckCheck /> Mark all read ({data.meta.unread})
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50',
                    !n.readAt && 'bg-primary/5',
                  )}
                  onClick={() => {
                    if (!n.readAt) read.mutate(n.id);
                    const link = n.data?.link;
                    if (typeof link === 'string' && link.startsWith('/')) router.push(link);
                  }}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2.5 shrink-0 rounded-full',
                      n.readAt ? 'bg-transparent' : 'bg-deal',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm">{n.title}</b>
                    <span className="text-sm text-muted-foreground">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground/80">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                  <Badge variant="muted">{n.type}</Badge>
                </button>
              </li>
            ))}
          </ul>
          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.meta.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Bell />}
          title="You’re all caught up"
          description="Order updates, offers and account alerts will appear here."
        />
      )}
    </div>
  );
}

export function SecurityView() {
  const router = useRouter();
  const qc = useQueryClient();
  const clear = useAuth((s) => s.clear);
  const form = useZodForm(changePasswordSchema, {
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Login & security</h1>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>You’ll be signed out on all devices after changing it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid max-w-md gap-4"
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await api.auth.changePassword(v.currentPassword, v.newPassword);
                toast.success('Password changed — please sign in again');
                clear();
                qc.clear();
                router.replace('/login');
              } catch (e) {
                applyApiError(form, e);
              }
            })}
          >
            <Field
              label="Current password"
              htmlFor="cp"
              error={form.formState.errors.currentPassword?.message}
            >
              <Input
                id="cp"
                type="password"
                autoComplete="current-password"
                {...form.register('currentPassword')}
              />
            </Field>
            <Field
              label="New password"
              htmlFor="np"
              error={form.formState.errors.newPassword?.message}
              hint="8+ characters with a letter and a number"
            >
              <Input
                id="np"
                type="password"
                autoComplete="new-password"
                {...form.register('newPassword')}
              />
            </Field>
            <Button type="submit" className="w-fit" loading={form.formState.isSubmitting}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="size-4" /> Sessions
          </CardTitle>
          <CardDescription>
            Sign out of every browser and phone where you’re logged in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={async () => {
              try {
                await api.auth.logoutAll();
              } catch {
                /* already signed out */
              }
              clear();
              qc.clear();
              toast.success('Signed out of all devices');
              router.replace('/login');
            }}
          >
            <LogOut /> Log out of all devices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function WishlistView() {
  const [page, setPage] = useState(1);
  const status = useAuth((s) => s.status);
  const { data, isLoading } = hooks.useWishlist(
    { page, limit: 24 },
    { enabled: status === 'authed' },
  );
  if (status === 'guest') {
    return (
      <EmptyState
        icon={<Heart />}
        title="Sign in to see your wishlist"
        description="Save items you love and come back to them any time."
        action={
          <Button asChild>
            <Link href="/login?next=/wishlist">Sign in</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
        My wishlist{' '}
        {data ? (
          <span className="text-lg font-semibold text-muted-foreground">({data.meta.total})</span>
        ) : null}
      </h1>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : data && data.items.length > 0 ? (
        <>
          <ProductGrid products={data.items.map((i) => i.product)} />
          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.meta.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Heart />}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here."
          action={
            <Button asChild>
              <Link href="/">Discover products</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export function ConfirmationView({ id }: { id: string }) {
  const { data: order, isLoading } = hooks.useOrder(id);
  if (isLoading || !order)
    return (
      <div className="container-page py-16">
        <Skeleton className="mx-auto h-72 max-w-2xl" />
      </div>
    );
  const ok =
    order.status !== 'PENDING_PAYMENT' &&
    order.status !== 'PAYMENT_FAILED' &&
    order.status !== 'CANCELLED';
  return (
    <div className="container-page py-10 sm:py-16">
      <div className="mx-auto max-w-2xl rounded-3xl border bg-card p-6 text-center shadow-lift sm:p-10">
        <div
          className={cn(
            'mx-auto mb-5 grid size-20 place-content-center rounded-full',
            ok ? 'bg-success/15 text-success' : 'bg-warning/20 text-warning',
          )}
        >
          <CircleCheck className="size-11 animate-in zoom-in-50 duration-500" />
        </div>
        <h1 className="font-display text-3xl font-extrabold" data-testid="confirmation-heading">
          {ok
            ? 'Thank you! Your order is placed'
            : order.status === 'PENDING_PAYMENT'
              ? 'Complete your payment'
              : 'Order not completed'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {ok
            ? 'We’ve emailed your order confirmation and GST invoice.'
            : 'Your items are reserved for a few minutes.'}
        </p>
        <dl className="my-7 grid grid-cols-2 gap-4 rounded-2xl bg-muted/60 p-5 text-left text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Order number</dt>
            <dd className="font-bold" data-testid="order-number">
              {order.orderNumber}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="font-bold">{formatINR(order.pricing.total, true)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Payment</dt>
            <dd className="font-bold">
              {order.paymentMethod === 'COD'
                ? 'Cash on Delivery'
                : order.paymentStatus === 'PAID'
                  ? 'Paid online'
                  : 'Pending'}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs text-muted-foreground">Delivering to</dt>
            <dd className="font-semibold">
              {order.shippingAddress.fullName}, {order.shippingAddress.city} –{' '}
              {order.shippingAddress.pincode}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={`/account/orders/${order.id}`}>
              {order.status === 'PENDING_PAYMENT' ? 'Pay now' : 'Track your order'}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">Continue shopping</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
