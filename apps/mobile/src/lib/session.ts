import type { AuthResult } from '@gk/types';
import { api, client } from './api';
import { tokenStore, useAuth } from './auth-store';
import { queryClient } from './query';
import { peekGuestCartId, resetGuestCartId } from './storage';

/** Called after any successful login / register / OTP verify. Persists the refresh token and merges the guest cart. */
export async function completeAuth(result: AuthResult): Promise<void> {
  if (result.refreshToken) await tokenStore.setRefreshToken?.(result.refreshToken);
  useAuth.getState().setSession(result);
  const guest = peekGuestCartId();
  if (guest) {
    try {
      await api.cart.merge(guest);
      await resetGuestCartId();
    } catch {
      /* the guest cart is merged on the next login; never block sign-in on it */
    }
  }
  await queryClient.invalidateQueries();
}

/** Restore the session on app start from the refresh token stored in SecureStore. */
export async function bootstrapAuth(): Promise<void> {
  try {
    const rt = await tokenStore.getRefreshToken?.();
    if (!rt) return useAuth.getState().clear();
    const ok = await client.refresh();
    if (!ok) useAuth.getState().clear();
  } catch {
    useAuth.getState().clear();
  }
}

export async function signOut(): Promise<void> {
  try {
    const rt = await tokenStore.getRefreshToken?.();
    await api.auth.logout(rt ?? undefined);
  } catch {
    /* already signed out server-side or offline: still clear locally */
  }
  await tokenStore.setRefreshToken?.(null);
  useAuth.getState().clear();
  queryClient.clear();
}
