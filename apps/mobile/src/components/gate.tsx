import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-store';
import { EmptyState, Spinner } from './ui';

/** Renders children only for signed-in users; guests get a sign-in prompt instead of a failing request. */
export function RequireAuth({
  children,
  title = 'Sign in to continue',
  message = 'Log in or create an account to see this.',
  next,
}: {
  children: ReactNode;
  title?: string;
  message?: string;
  next?: string;
}) {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  if (status === 'loading') return <Spinner />;
  if (status === 'guest') {
    return (
      <EmptyState
        icon="person-circle-outline"
        title={title}
        message={message}
        action="Login or sign up"
        onAction={() =>
          router.push(next ? { pathname: '/auth/login', params: { next } } : '/auth/login')
        }
      />
    );
  }
  return <>{children}</>;
}
