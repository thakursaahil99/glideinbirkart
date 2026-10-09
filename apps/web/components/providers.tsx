'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { SiteBrandProvider, type SiteBrand } from '@/components/site-theme';
import { Toaster } from 'sonner';
import { ApiError } from '@gk/api-client';
import { TooltipProvider } from '@/components/ui/overlay';
import { client } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { getGuestCartId, peekGuestCartId, resetGuestCartId } from '@/lib/guest-cart';
import { api } from '@/lib/api';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
}

/**
 * Restores the session on first load: if the CSRF cookie exists we have (probably) a refresh cookie,
 * so exchange it for an access token. After login the guest cart is merged into the user's cart.
 */
function AuthBootstrap() {
  useEffect(() => {
    getGuestCartId(); // ensure the id exists so the very first add-to-cart works for guests
    const hasSession = document.cookie.split('; ').some((c) => c.startsWith('gk_csrf='));
    if (!hasSession) {
      useAuth.getState().clear();
      return;
    }
    void client.refresh().then((ok) => {
      if (!ok) useAuth.getState().clear();
    });
  }, []);
  return null;
}

/** When a user becomes authenticated, fold any guest cart (Redis) into the account cart. */
function GuestCartMerge({ qc }: { qc: QueryClient }) {
  const status = useAuth((s) => s.status);
  useEffect(() => {
    if (status !== 'authed') return;
    const guest = peekGuestCartId();
    if (!guest) return;
    api.cart
      .merge(guest)
      .then((cart) => qc.setQueryData(['cart'], cart))
      .catch(() => undefined)
      .finally(() => {
        resetGuestCartId();
        getGuestCartId();
      });
  }, [status, qc]);
  return null;
}

export function Providers({
  children,
  brand,
}: {
  children: React.ReactNode;
  brand?: SiteBrand | null;
}) {
  const [qc] = useState(makeQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <AuthBootstrap />
          <GuestCartMerge qc={qc} />
          <SiteBrandProvider brand={brand ?? null}>{children}</SiteBrandProvider>
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ classNames: { toast: 'rounded-xl font-sans' } }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
