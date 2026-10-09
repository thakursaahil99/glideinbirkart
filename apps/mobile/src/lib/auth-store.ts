import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthResult, UserDto } from '@gk/types';
import type { TokenStore } from '@gk/api-client';

const REFRESH_KEY = 'gk_refresh_token';

type Status = 'loading' | 'authed' | 'guest';

interface AuthState {
  status: Status;
  user: UserDto | null;
  accessToken: string | null;
  setSession: (r: AuthResult) => void;
  setUser: (u: UserDto) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  setSession: (r) => set({ status: 'authed', user: r.user, accessToken: r.accessToken }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: 'guest', user: null, accessToken: null }),
}));

/** Access token lives in memory; the rotating refresh token is kept in the OS keychain / Keystore. */
export const tokenStore: TokenStore = {
  getAccessToken: () => useAuth.getState().accessToken,
  setAccessToken: (accessToken) => useAuth.setState({ accessToken }),
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefreshToken: async (token) => {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
