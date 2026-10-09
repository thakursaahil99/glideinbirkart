import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { vars } from 'nativewind';
import { themeToVars } from '@gk/ui/theme-utils';
import { dark, light } from '@gk/ui/tokens';
import { hooks } from './api';

/** Admin-controlled theme (Admin → Appearance). Cached on disk, so the last known look applies instantly on launch. */
export function useThemeSettings() {
  return hooks.useTheme().data;
}

/** Brand name from the admin theme, with the original name as the fallback. */
export function useSiteName() {
  return useThemeSettings()?.siteName ?? 'Glideinbir Kart';
}

/** Token → "H S% L%" for the active colour scheme (built-in tokens until the admin theme has loaded). */
function useTokens(): Record<string, string> {
  const scheme = useColorScheme();
  const theme = useThemeSettings();
  return useMemo(() => {
    const mode = scheme === 'dark' ? 'dark' : 'light';
    return theme ? themeToVars(theme)[mode] : mode === 'dark' ? dark : light;
  }, [theme, scheme]);
}

/** Style that re-points every NativeWind colour variable (`bg-primary`, `text-foreground`…) at the admin theme. */
export function useThemeStyle() {
  const tokens = useTokens();
  const radius = useThemeSettings()?.radius;
  return useMemo(
    () =>
      vars({
        ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
        ...(radius === undefined ? {} : { '--radius': `${radius * 16}px` }),
      }),
    [tokens, radius],
  );
}

/** Runtime colour values for places NativeWind classes cannot reach (icon colours, refresh controls, status bar). */
export function useColors() {
  const scheme = useColorScheme();
  const t = useTokens();
  const c = (name: string) => `hsl(${t[name]})`;
  return {
    scheme: scheme ?? 'light',
    background: c('background'),
    foreground: c('foreground'),
    card: c('card'),
    primary: c('primary'),
    primaryForeground: c('primary-foreground'),
    muted: c('muted'),
    mutedForeground: c('muted-foreground'),
    accent: c('accent'),
    border: c('border'),
    destructive: c('destructive'),
    success: c('success'),
    warning: c('warning'),
    deal: c('deal'),
  };
}
