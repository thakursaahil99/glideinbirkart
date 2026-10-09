/**
 * Turns an admin-edited theme (hex colours) into the HSL-triplet CSS variables the Tailwind preset consumes.
 * Shared by the website (inline <style>), the admin live preview and the mobile app (NativeWind `vars()`).
 */
const { light: baseLight, dark: baseDark } = require('./tokens');

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Variables for one palette. Colours not editable by the admin fall back to the built-in tokens. */
function paletteToVars(palette, base) {
  const v = { ...base };
  for (const [k, hex] of Object.entries(palette || {})) {
    const hsl = hexToHsl(hex);
    if (hsl) v[k] = hsl;
  }
  const p = (k) => (palette && hexToHsl(palette[k])) || base[k];
  v['card-foreground'] = p('foreground');
  v.popover = p('card');
  v['popover-foreground'] = p('foreground');
  v.input = p('border');
  v.ring = p('primary');
  return v;
}

/** `{ light, dark }` maps of `token -> "H S% L%"`. */
function themeToVars(theme) {
  return {
    light: paletteToVars(theme && theme.light, baseLight),
    dark: paletteToVars(theme && theme.dark, baseDark),
  };
}

const FONT_FALLBACK = 'ui-sans-serif, system-ui, sans-serif';
const q = (s) => `'${String(s).replace(/['"\<>;{}]/g, '')}'`;

/** Google Fonts stylesheet URL for the chosen families (null when both are the built-in defaults). */
function themeFontsHref(theme, defaults) {
  const d = defaults || { fontDisplay: 'Bricolage Grotesque', fontSans: 'Instrument Sans' };
  const fams = [];
  if (theme.fontDisplay && theme.fontDisplay !== d.fontDisplay) fams.push(theme.fontDisplay);
  if (theme.fontSans && theme.fontSans !== d.fontSans && !fams.includes(theme.fontSans))
    fams.push(theme.fontSans);
  if (!fams.length) return null;
  const q2 = fams.map(
    (f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800`,
  );
  return `https://fonts.googleapis.com/css2?${q2.join('&')}&display=swap`;
}

/** CSS for the website. Selectors are one notch more specific than theme.css so they always win. */
function themeToCss(theme, defaults) {
  const { light, dark } = themeToVars(theme);
  const block = (vars) =>
    Object.entries(vars)
      .map(([k, v]) => `--${k}:${v};`)
      .join('');
  const d = defaults || { fontDisplay: 'Bricolage Grotesque', fontSans: 'Instrument Sans' };
  let css = `:root:not(.dark){${block(light)}}:root.dark{${block(dark)}}`;
  const radius = Number(theme.radius);
  css += `html:root{--radius:${Number.isFinite(radius) ? radius : 0.75}rem;`;
  if (theme.fontDisplay && theme.fontDisplay !== d.fontDisplay)
    css += `--font-display:${q(theme.fontDisplay)},${FONT_FALLBACK};`;
  if (theme.fontSans && theme.fontSans !== d.fontSans)
    css += `--font-sans:${q(theme.fontSans)},${FONT_FALLBACK};`;
  return css + '}';
}

module.exports = { hexToHsl, themeToVars, themeToCss, themeFontsHref };
