'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import type { Role } from '@gk/types';
import { useAuth } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/data';
import Link from 'next/link';

/** Client-side guard (the proxy and the API enforce the same rules; this handles session expiry mid-visit). */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'guest') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authed' || !user) {
    return (
      <div
        className="grid min-h-[50dvh] place-content-center"
        role="status"
        aria-label="Checking your session"
      >
        <Spinner className="size-7" />
      </div>
    );
  }
  if (
    roles &&
    !roles.includes(user.role) &&
    !(user.role === 'SUPER_ADMIN' && roles.includes('ADMIN'))
  ) {
    return (
      <div className="mx-auto grid min-h-[50dvh] max-w-md place-content-center gap-3 text-center">
        <ShieldAlert className="mx-auto size-10 text-destructive" />
        <h1 className="font-display text-2xl font-extrabold">You don’t have access</h1>
        <p className="text-sm text-muted-foreground">
          This area is restricted for your account type.
        </p>
        <Button asChild className="mx-auto">
          <Link href="/">Go to home</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
