'use client';

import { create } from 'zustand';
import type { AuthResult, UserDto } from '@gk/types';
import type { TokenStore } from '@gk/api-client';

type Status = 'loading' | 'authed' | 'guest';

interface AuthState {
  status: Status;
  user: UserDto | null;
  /** Kept in memory only (never localStorage) — the refresh token lives in an httpOnly cookie. */
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

export const tokenStore: TokenStore = {
  getAccessToken: () => useAuth.getState().accessToken,
  setAccessToken: (accessToken) => useAuth.setState({ accessToken }),
};

export const isStaff = (role?: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';
