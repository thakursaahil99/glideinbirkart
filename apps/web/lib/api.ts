import { createApi, createClient, createHooks } from '@gk/api-client';
import { tokenStore, useAuth } from './auth-store';
import { getGuestCartId } from './guest-cart';

const isServer = typeof window === 'undefined';
const API_ORIGIN = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * One typed client for the whole app.
 * Browser → same-origin `/api/v1` (proxied by Next rewrites, so cookies are first-party).
 * Server  → the API origin directly.
 */
export const client = createClient({
  baseUrl: isServer ? `${API_ORIGIN}/api/v1` : '/api/v1',
  platform: 'web',
  tokens: tokenStore,
  getGuestCartId,
  onSessionExpired: () => useAuth.getState().clear(),
  onAuthResult: (r) => useAuth.getState().setSession(r),
});

export const api = createApi(client);
export const hooks = createHooks(api);
