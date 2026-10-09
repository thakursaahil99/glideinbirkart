import { createApi, createClient, createHooks } from '@gk/api-client';
import { API_URL } from './config';
import { tokenStore, useAuth } from './auth-store';
import { getGuestCartId } from './storage';

export const client = createClient({
  baseUrl: API_URL,
  platform: 'mobile',
  tokens: tokenStore,
  getGuestCartId,
  onSessionExpired: () => useAuth.getState().clear(),
  onAuthResult: (r) => useAuth.getState().setSession(r),
});

export const api = createApi(client);
export const hooks = createHooks(api);
