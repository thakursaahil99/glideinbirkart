/** Colours an admin can change. Everything else (card-foreground, input, ring…) is derived from these. */
export const THEME_COLOR_KEYS = [
  'background',
  'foreground',
  'card',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'muted',
  'muted-foreground',
  'border',
  'deal',
  'success',
  'destructive',
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
/** `#rrggbb` per colour key. */
export type ThemePalette = Record<ThemeColorKey, string>;

/** Google Fonts the storefront can load (web only; the mobile app keeps its system font). */
export const THEME_DISPLAY_FONTS = [
  'Bricolage Grotesque',
  'Poppins',
  'Montserrat',
  'Outfit',
  'Sora',
  'Playfair Display',
  'DM Serif Display',
  'Space Grotesk',
] as const;
export const THEME_SANS_FONTS = [
  'Instrument Sans',
  'Inter',
  'DM Sans',
  'Nunito Sans',
  'Lato',
  'Poppins',
  'Manrope',
] as const;
export type ThemeDisplayFont = (typeof THEME_DISPLAY_FONTS)[number];
export type ThemeSansFont = (typeof THEME_SANS_FONTS)[number];

/** Admin-controlled look & feel, served to the website and the mobile app. */
export interface ThemeSettings {
  siteName: string;
  tagline: string;
  /** Replaces the built-in logo mark when set. */
  logoUrl: string | null;
  /** Corner radius in rem (0 = square, 1.5 = very round). */
  radius: number;
  fontDisplay: ThemeDisplayFont;
  fontSans: ThemeSansFont;
  light: ThemePalette;
  dark: ThemePalette;
}
