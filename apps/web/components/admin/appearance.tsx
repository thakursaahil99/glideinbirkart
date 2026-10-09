'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon, RotateCcw, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { themeFontsHref, themeToVars } from '@gk/ui/theme-utils';
import { themeSettingsSchema } from '@gk/validators';
import {
  THEME_COLOR_KEYS,
  THEME_DISPLAY_FONTS,
  THEME_SANS_FONTS,
  type ThemeColorKey,
  type ThemePalette,
  type ThemeSettings,
} from '@gk/types';
import { api } from '@/lib/api';
import { tokenStore } from '@/lib/auth-store';
import { errMsg } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { PageHeader } from '@/components/dashboard/common';
import { ImageUploader } from '@/components/store/image-uploader';
import { Img } from '@/components/ui/img';

const LABELS: Record<ThemeColorKey, { label: string; hint: string }> = {
  primary: { label: 'Brand colour', hint: 'Buttons, links, active states' },
  'primary-foreground': { label: 'Text on brand colour', hint: 'Label inside primary buttons' },
  accent: { label: 'Accent colour', hint: 'Highlights, "Buy now", badges' },
  'accent-foreground': { label: 'Text on accent', hint: 'Label inside accent buttons' },
  background: { label: 'Page background', hint: 'Behind everything' },
  foreground: { label: 'Main text', hint: 'Headings and body text' },
  card: { label: 'Card background', hint: 'Product cards, panels, header' },
  secondary: { label: 'Soft brand tint', hint: 'Chips, light buttons' },
  'secondary-foreground': { label: 'Text on soft tint', hint: 'Label inside chips' },
  muted: { label: 'Muted background', hint: 'Image placeholders, subtle areas' },
  'muted-foreground': { label: 'Muted text', hint: 'Captions, helper text' },
  border: { label: 'Borders & dividers', hint: 'Lines around cards and inputs' },
  deal: { label: 'Deal / discount', hint: '"34% off" and sale tags' },
  success: { label: 'Success', hint: 'In stock, delivered' },
  destructive: { label: 'Error / danger', hint: 'Out of stock, delete' },
};
const GROUPS: Array<{ title: string; keys: ThemeColorKey[] }> = [
  {
    title: 'Brand',
    keys: [
      'primary',
      'primary-foreground',
      'accent',
      'accent-foreground',
      'secondary',
      'secondary-foreground',
    ],
  },
  {
    title: 'Surfaces & text',
    keys: ['background', 'card', 'foreground', 'muted', 'muted-foreground', 'border'],
  },
  { title: 'Status', keys: ['deal', 'success', 'destructive'] },
];

type PresetColors = Partial<ThemePalette>;
const PRESETS: Array<{ name: string; light: PresetColors; dark: PresetColors }> = [
  {
    name: 'Emerald',
    light: {
      primary: '#047857',
      'primary-foreground': '#ffffff',
      secondary: '#e6f4ee',
      'secondary-foreground': '#064e3b',
      accent: '#f59e0b',
      'accent-foreground': '#141424',
    },
    dark: {
      primary: '#34d399',
      'primary-foreground': '#06251b',
      secondary: '#12261f',
      'secondary-foreground': '#b7f0d8',
      accent: '#fbbf24',
      'accent-foreground': '#06251b',
    },
  },
  {
    name: 'Rose',
    light: {
      primary: '#be123c',
      'primary-foreground': '#ffffff',
      secondary: '#fde8ee',
      'secondary-foreground': '#881337',
      accent: '#f59e0b',
      'accent-foreground': '#141424',
    },
    dark: {
      primary: '#fb7185',
      'primary-foreground': '#3b0a16',
      secondary: '#2a141b',
      'secondary-foreground': '#fecdd3',
      accent: '#fbbf24',
      'accent-foreground': '#2a0a12',
    },
  },
  {
    name: 'Ocean',
    light: {
      primary: '#0369a1',
      'primary-foreground': '#ffffff',
      secondary: '#e3f1f9',
      'secondary-foreground': '#0c4a6e',
      accent: '#f97316',
      'accent-foreground': '#141424',
    },
    dark: {
      primary: '#38bdf8',
      'primary-foreground': '#04202e',
      secondary: '#11222d',
      'secondary-foreground': '#bae6fd',
      accent: '#fb923c',
      'accent-foreground': '#1c0e04',
    },
  },
  {
    name: 'Sunset',
    light: {
      primary: '#c2410c',
      'primary-foreground': '#ffffff',
      secondary: '#fdeee3',
      'secondary-foreground': '#7c2d12',
      accent: '#0d9488',
      'accent-foreground': '#ffffff',
    },
    dark: {
      primary: '#fb923c',
      'primary-foreground': '#2b1204',
      secondary: '#2a1a10',
      'secondary-foreground': '#fed7aa',
      accent: '#2dd4bf',
      'accent-foreground': '#04201e',
    },
  },
  {
    name: 'Charcoal',
    light: {
      primary: '#18181b',
      'primary-foreground': '#ffffff',
      secondary: '#f1f1f2',
      'secondary-foreground': '#18181b',
      accent: '#eab308',
      'accent-foreground': '#141424',
    },
    dark: {
      primary: '#fafafa',
      'primary-foreground': '#18181b',
      secondary: '#232326',
      'secondary-foreground': '#e4e4e7',
      accent: '#facc15',
      'accent-foreground': '#18181b',
    },
  },
];

/** Tell the storefront to drop its cached theme right away (best effort; it also refreshes by itself within a minute). */
async function refreshStorefront() {
  const token = tokenStore.getAccessToken();
  if (!token) return;
  await fetch('/api/theme-revalidate', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function AppearanceAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-theme'],
    queryFn: () => api.admin.theme.get(),
  });
  if (isLoading || !data) return <Skeleton className="h-96" />;
  return <AppearanceEditor key={JSON.stringify(data)} saved={data} />;
}

function ColorRow({
  k,
  value,
  onChange,
}: {
  k: ThemeColorKey;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = HEX.test(text);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={LABELS[k].label}
        value={HEX.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{LABELS[k].label}</p>
        <p className="truncate text-xs text-muted-foreground">{LABELS[k].hint}</p>
      </div>
      <Input
        aria-label={`${LABELS[k].label} hex`}
        value={text}
        maxLength={7}
        aria-invalid={!valid}
        onChange={(e) => {
          setText(e.target.value);
          if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
        className="h-10 w-28 font-mono text-xs uppercase"
      />
    </div>
  );
}

function AppearanceEditor({ saved }: { saved: ThemeSettings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ThemeSettings>(saved);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof ThemeSettings>(k: K, v: ThemeSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const setColor = (k: ThemeColorKey, v: string) =>
    setDraft((d) => ({ ...d, [mode]: { ...d[mode], [k]: v } }));

  const save = async () => {
    const parsed = themeSettingsSchema.safeParse(draft);
    if (!parsed.success)
      return toast.error(parsed.error.issues[0]?.message ?? 'Please check the highlighted fields');
    setBusy(true);
    try {
      await api.admin.theme.update(parsed.data as ThemeSettings);
      await refreshStorefront();
      toast.success(
        'Appearance saved — the website is updated; the app picks it up within a few minutes',
      );
      await qc.invalidateQueries({ queryKey: ['admin-theme'] });
      await qc.invalidateQueries({ queryKey: ['theme'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm('Reset the whole look & feel to the original design?')) return;
    setBusy(true);
    try {
      await api.admin.theme.reset();
      await refreshStorefront();
      toast.success('Reset to the original design');
      await qc.invalidateQueries({ queryKey: ['admin-theme'] });
      await qc.invalidateQueries({ queryKey: ['theme'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const applyPreset = (p: (typeof PRESETS)[number]) =>
    setDraft((d) => ({ ...d, light: { ...d.light, ...p.light }, dark: { ...d.dark, ...p.dark } }));

  return (
    <>
      <PageHeader
        title="Appearance"
        description="Colours, fonts, logo and name for the website and the mobile app. The website updates instantly; the mobile app picks changes up within a few minutes."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} disabled={busy}>
              <RotateCcw /> Reset to original
            </Button>
            <Button variant="ghost" onClick={() => setDraft(saved)} disabled={!dirty || busy}>
              Discard
            </Button>
            <Button onClick={save} disabled={!dirty || busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Brand</CardTitle>
              <CardDescription>
                Shown in the header, footer, login pages and the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Site name" htmlFor="ap-name">
                <Input
                  id="ap-name"
                  value={draft.siteName}
                  maxLength={40}
                  onChange={(e) => set('siteName', e.target.value)}
                />
              </Field>
              <Field label="Tagline" htmlFor="ap-tag">
                <Input
                  id="ap-tag"
                  value={draft.tagline}
                  maxLength={120}
                  onChange={(e) => set('tagline', e.target.value)}
                />
              </Field>
              <Field
                label="Logo"
                hint="Square image works best. Leave empty to keep the built-in mark."
                className="sm:col-span-2"
              >
                <ImageUploader
                  folder="misc"
                  max={1}
                  value={draft.logoUrl ? [draft.logoUrl] : []}
                  onChange={(urls) => set('logoUrl', urls[0] ?? null)}
                  label="Logo"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colours</CardTitle>
              <CardDescription>
                Set the light and the dark look separately. Start from a preset, then fine-tune.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-primary"
                  >
                    <span
                      className="size-4 rounded-full ring-1 ring-black/10"
                      style={{ background: p.light.primary }}
                    />
                    <span
                      className="size-4 -ml-3 rounded-full ring-1 ring-black/10"
                      style={{ background: p.light.accent }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'light' | 'dark')}>
                <TabsList>
                  <TabsTrigger value="light">
                    <Sun className="size-4" /> Light mode
                  </TabsTrigger>
                  <TabsTrigger value="dark">
                    <Moon className="size-4" /> Dark mode
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {GROUPS.map((g) => (
                <div key={g.title} className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {g.title}
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {g.keys.map((k) => (
                      <ColorRow
                        key={`${mode}-${k}`}
                        k={k}
                        value={draft[mode][k]}
                        onChange={(v) => setColor(k, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fonts & shape</CardTitle>
              <CardDescription>
                Fonts apply to the website. The mobile app keeps its system font.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Heading font" htmlFor="ap-fd">
                <Select
                  id="ap-fd"
                  value={draft.fontDisplay}
                  onChange={(e) =>
                    set('fontDisplay', e.target.value as ThemeSettings['fontDisplay'])
                  }
                >
                  {THEME_DISPLAY_FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Body font" htmlFor="ap-fs">
                <Select
                  id="ap-fs"
                  value={draft.fontSans}
                  onChange={(e) => set('fontSans', e.target.value as ThemeSettings['fontSans'])}
                >
                  {THEME_SANS_FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label={`Corner roundness — ${Math.round((draft.radius / 1.5) * 100)}%`}
                hint="0% is square, 100% is very round"
                className="sm:col-span-2"
              >
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={draft.radius}
                  onChange={(e) => set('radius', Number(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-primary"
                  aria-label="Corner roundness"
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Preview theme={draft} mode={mode} onMode={setMode} />
        </div>
      </div>
    </>
  );
}

/** A miniature storefront rendered with the draft theme's variables, scoped to this box only. */
function Preview({
  theme,
  mode,
  onMode,
}: {
  theme: ThemeSettings;
  mode: 'light' | 'dark';
  onMode: (m: 'light' | 'dark') => void;
}) {
  const vars = useMemo(() => themeToVars(theme)[mode], [theme, mode]);
  const fonts = themeFontsHref(theme, { fontDisplay: '', fontSans: '' });
  const style = {
    ...Object.fromEntries(Object.entries(vars).map(([k, v]) => [`--${k}`, v])),
    '--radius': `${theme.radius}rem`,
    fontFamily: `'${theme.fontSans}', ui-sans-serif, system-ui, sans-serif`,
  } as React.CSSProperties;
  const display = { fontFamily: `'${theme.fontDisplay}', ui-sans-serif, system-ui, sans-serif` };
  const words = theme.siteName.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  const r = 'var(--radius)';
  return (
    <div>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Live preview</p>
        <div className="flex gap-1 rounded-full border bg-card p-0.5">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div
        style={style}
        className="overflow-hidden rounded-2xl border bg-background text-foreground shadow-soft"
      >
        <div className="flex items-center gap-2 border-b bg-card px-3 py-2.5">
          {theme.logoUrl ? (
            <span className="relative size-7 overflow-hidden rounded-lg">
              <Img src={theme.logoUrl} alt="" fill sizes="28px" className="object-contain" />
            </span>
          ) : (
            <span
              className="grid size-7 place-content-center bg-primary text-xs font-black text-primary-foreground"
              style={{ borderRadius: `calc(${r} - 2px)` }}
            >
              {theme.siteName.charAt(0)}
            </span>
          )}
          <span className="text-base font-extrabold leading-none" style={display}>
            {words.join(' ')}
            {last && <span className="text-primary"> {last}</span>}
            <span className="text-accent">.</span>
          </span>
          <span className="ml-auto h-6 w-20 bg-muted" style={{ borderRadius: r }} />
        </div>
        <div className="space-y-3 p-3">
          <div
            className="bg-primary p-4 text-primary-foreground"
            style={{ borderRadius: `calc(${r} + 6px)` }}
          >
            <p className="text-lg font-extrabold leading-tight" style={display}>
              Big Savings on Electronics
            </p>
            <p className="mt-1 text-xs opacity-90">{theme.tagline}</p>
            <span
              className="mt-3 inline-block bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground"
              style={{ borderRadius: '999px' }}
            >
              Shop now
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span
              className="bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
              style={{ borderRadius: '999px' }}
            >
              Electronics
            </span>
            <span
              className="bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
              style={{ borderRadius: '999px' }}
            >
              Fashion
            </span>
            <span
              className="bg-muted px-2.5 py-1 text-xs text-muted-foreground"
              style={{ borderRadius: '999px' }}
            >
              Home
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {['Wireless Headphones', 'Cotton T-shirt'].map((n, i) => (
              <div key={n} className="overflow-hidden border bg-card" style={{ borderRadius: r }}>
                <div className="aspect-[4/3] bg-muted" />
                <div className="space-y-1 p-2.5">
                  <p className="truncate text-xs font-semibold">{n}</p>
                  <p className="flex items-baseline gap-1.5 text-sm font-extrabold">
                    ₹{i ? '499' : '1,299'}
                    <span className="text-[10px] font-bold text-deal">34% off</span>
                  </p>
                  <p className="text-[10px] font-medium text-success">In stock</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <span
              className="flex-1 bg-primary py-2 text-center text-xs font-bold text-primary-foreground"
              style={{ borderRadius: r }}
            >
              Add to cart
            </span>
            <span
              className="flex-1 bg-accent py-2 text-center text-xs font-bold text-accent-foreground"
              style={{ borderRadius: r }}
            >
              Buy now
            </span>
          </div>
          <p className="text-[11px] text-destructive">Out of stock items show in this colour.</p>
        </div>
      </div>
    </div>
  );
}
