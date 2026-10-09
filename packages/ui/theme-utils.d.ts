type Theme = {
  light?: Record<string, string>;
  dark?: Record<string, string>;
  radius?: number;
  fontDisplay?: string;
  fontSans?: string;
};
type FontDefaults = { fontDisplay: string; fontSans: string };
export declare function hexToHsl(hex: string): string | null;
export declare function themeToVars(theme: Theme): {
  light: Record<string, string>;
  dark: Record<string, string>;
};
export declare function themeToCss(theme: Theme, defaults?: FontDefaults): string;
export declare function themeFontsHref(theme: Theme, defaults?: FontDefaults): string | null;
