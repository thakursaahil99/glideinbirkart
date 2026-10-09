'use client';

import { createContext, useContext } from 'react';
import type { ThemeSettings } from '@gk/types';

/** The brand bits of the admin-controlled theme that components need at render time (colours/fonts are plain CSS). */
export type SiteBrand = Pick<ThemeSettings, 'siteName' | 'tagline' | 'logoUrl'>;

const FALLBACK: SiteBrand = {
  siteName: 'Glideinbir Kart',
  tagline: 'Shop online in India',
  logoUrl: null,
};
const Ctx = createContext<SiteBrand>(FALLBACK);

export function SiteBrandProvider({
  brand,
  children,
}: {
  brand: SiteBrand | null;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={brand ?? FALLBACK}>{children}</Ctx.Provider>;
}

export const useSiteBrand = () => useContext(Ctx);

/** Inline site name, for server components that can't call the hook. */
export function SiteName() {
  return <>{useSiteBrand().siteName}</>;
}
