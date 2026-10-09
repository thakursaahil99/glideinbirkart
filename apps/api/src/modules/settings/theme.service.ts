import { Injectable } from '@nestjs/common';
import type { ThemeSettings } from '@gk/types';
import { Prisma } from '@gk/db';
import { PrismaService } from '../../infra/prisma.service';
import { CacheNs, CacheService } from '../../infra/cache.service';

/** Mirrors the built-in design tokens (packages/ui/tokens.js) so a fresh install looks exactly as before. */
export const DEFAULT_THEME: ThemeSettings = {
  siteName: 'Glideinbir Kart',
  tagline: 'Shop online in India',
  logoUrl: null,
  radius: 0.75,
  fontDisplay: 'Bricolage Grotesque',
  fontSans: 'Instrument Sans',
  light: {
    background: '#fcfaf8',
    foreground: '#141424',
    card: '#ffffff',
    primary: '#402dbe',
    'primary-foreground': '#ffffff',
    secondary: '#eeedf8',
    'secondary-foreground': '#2d246b',
    accent: '#faa019',
    'accent-foreground': '#141424',
    muted: '#f3f1ec',
    'muted-foreground': '#595969',
    border: '#e5e2dc',
    deal: '#ef4d25',
    success: '#1f8455',
    destructive: '#e3291c',
  },
  dark: {
    background: '#0e0e16',
    foreground: '#f7f6f2',
    card: '#14141f',
    primary: '#806ef7',
    'primary-foreground': '#121221',
    secondary: '#232136',
    'secondary-foreground': '#cec8f9',
    accent: '#f8a425',
    'accent-foreground': '#121221',
    muted: '#20202c',
    'muted-foreground': '#a1a1af',
    border: '#2a2a37',
    deal: '#f56a47',
    success: '#35b67a',
    destructive: '#eb5247',
  },
};

const KEY = 'theme';

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Stored theme merged over the defaults, so newly added keys never come back undefined. */
  async get(): Promise<ThemeSettings> {
    return this.cache.wrapNs(CacheNs.settings, 'theme', 300, async () => {
      const row = await this.prisma.siteSetting.findUnique({ where: { key: KEY } });
      const stored = (row?.value ?? {}) as Partial<ThemeSettings>;
      return {
        ...DEFAULT_THEME,
        ...stored,
        light: { ...DEFAULT_THEME.light, ...(stored.light ?? {}) },
        dark: { ...DEFAULT_THEME.dark, ...(stored.dark ?? {}) },
      };
    });
  }

  async update(next: ThemeSettings): Promise<ThemeSettings> {
    await this.prisma.siteSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    await this.cache.bump(CacheNs.settings);
    return this.get();
  }

  async reset(): Promise<ThemeSettings> {
    await this.prisma.siteSetting.deleteMany({ where: { key: KEY } });
    await this.cache.bump(CacheNs.settings);
    return this.get();
  }
}
