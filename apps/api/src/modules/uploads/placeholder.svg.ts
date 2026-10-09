/**
 * Generates tasteful product / banner artwork as SVG so a fresh install (and the seed data)
 * looks coherent without any external image hosting. Real deployments replace these URLs with
 * Cloudinary uploads.
 */

const PALETTES: Array<[string, string, string]> = [
  ['#4338ca', '#7c3aed', '#fbbf24'],
  ['#0f766e', '#10b981', '#fde68a'],
  ['#be123c', '#f43f5e', '#fde68a'],
  ['#1d4ed8', '#38bdf8', '#fcd34d'],
  ['#b45309', '#f59e0b', '#312e81'],
  ['#6d28d9', '#d946ef', '#fde047'],
  ['#0e7490', '#22d3ee', '#fb7185'],
  ['#3f3f46', '#71717a', '#fbbf24'],
];

const ICONS: Record<string, string> = {
  phone:
    '<rect x="32" y="10" width="36" height="80" rx="8"/><rect x="38" y="19" width="24" height="54" rx="3" fill-opacity=".28"/><circle cx="50" cy="81" r="3.2" fill-opacity=".6"/>',
  laptop:
    '<rect x="18" y="24" width="64" height="42" rx="5"/><rect x="23" y="29" width="54" height="32" rx="2" fill-opacity=".28"/><path d="M8 72h84l-7 9H15z"/>',
  headphones:
    '<path d="M20 60V50a30 30 0 0 1 60 0v10" fill="none" stroke-width="7" stroke-linecap="round"/><rect x="13" y="54" width="16" height="28" rx="7"/><rect x="71" y="54" width="16" height="28" rx="7"/>',
  speaker:
    '<rect x="26" y="12" width="48" height="76" rx="12"/><circle cx="50" cy="38" r="12" fill-opacity=".3"/><circle cx="50" cy="68" r="8" fill-opacity=".3"/>',
  watch:
    '<rect x="28" y="28" width="44" height="44" rx="13"/><rect x="38" y="8" width="24" height="18" rx="4"/><rect x="38" y="74" width="24" height="18" rx="4"/><path d="M50 40v11l8 5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3.5" stroke-linecap="round"/>',
  tv: '<rect x="10" y="20" width="80" height="52" rx="6"/><rect x="15" y="25" width="70" height="42" rx="2" fill-opacity=".28"/><path d="M34 84h32" stroke-width="6" stroke-linecap="round" fill="none"/>',
  shirt: '<path d="M33 12 10 24l8 18 10-5v47h44V37l10 5 8-18-23-12c-2 7-8 11-17 11s-15-4-17-11z"/>',
  jeans:
    '<path d="M28 10h44l6 80H55L50 40l-5 50H22z"/><path d="M28 22h44" stroke="#fff" stroke-opacity=".45" stroke-width="2.5" fill="none"/>',
  shoe: '<path d="M8 64c0-9 6-12 13-14l15-6 6 9 11 3c11 3 25 7 40 13 5 2 5 9 0 9H14c-4 0-6-3-6-6z"/><path d="M36 44l9 9m6-7 8 8" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>',
  saree:
    '<path d="M38 10h24l10 80H28z"/><path d="M38 10c10 20 24 38 34 80" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none"/><circle cx="50" cy="22" r="6" fill-opacity=".4"/>',
  dress:
    '<path d="M38 10h24l-3 24 17 56H24l17-56z"/><path d="M42 34h16" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none"/>',
  bag: '<path d="M24 36h52l7 52H17z"/><path d="M36 38v-8a14 14 0 0 1 28 0v8" fill="none" stroke-width="6" stroke-linecap="round"/>',
  sofa: '<rect x="20" y="24" width="60" height="26" rx="9"/><rect x="12" y="42" width="76" height="30" rx="9"/><rect x="8" y="48" width="16" height="30" rx="7"/><rect x="76" y="48" width="16" height="30" rx="7"/><path d="M26 78v8m48-8v8" stroke-width="5" stroke-linecap="round" fill="none"/>',
  lamp: '<path d="M32 12h36l10 34H22z"/><rect x="47" y="46" width="6" height="34" rx="3"/><rect x="32" y="80" width="36" height="8" rx="4"/>',
  bed: '<rect x="8" y="44" width="84" height="26" rx="6"/><rect x="8" y="26" width="16" height="44" rx="5"/><rect x="28" y="34" width="24" height="12" rx="5" fill-opacity=".4"/><path d="M8 78v8m84-8v8" stroke-width="5" stroke-linecap="round" fill="none"/>',
  pan: '<circle cx="42" cy="54" r="30"/><circle cx="42" cy="54" r="22" fill-opacity=".28"/><rect x="68" y="50" width="26" height="8" rx="4"/>',
  mixer:
    '<path d="M30 42h40l-5 44H35z"/><rect x="36" y="22" width="28" height="22" rx="5"/><rect x="44" y="12" width="12" height="12" rx="3"/><circle cx="50" cy="66" r="6" fill-opacity=".35"/>',
  book: '<path d="M12 18h30c5 0 8 3 8 8v56c0-5-3-8-8-8H12zM88 18H58c-5 0-8 3-8 8v56c0-5 3-8 8-8h30z"/>',
  notebook:
    '<rect x="24" y="10" width="52" height="80" rx="6"/><path d="M34 10v80" stroke="#fff" stroke-opacity=".45" stroke-width="3" fill="none"/><path d="M44 30h22m-22 12h22m-22 12h14" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round" fill="none"/>',
  bottle:
    '<rect x="36" y="28" width="28" height="60" rx="10"/><rect x="42" y="12" width="16" height="16" rx="4"/><rect x="40" y="46" width="20" height="22" rx="3" fill-opacity=".3"/>',
  jar: '<rect x="24" y="34" width="52" height="52" rx="12"/><rect x="28" y="18" width="44" height="16" rx="5"/><circle cx="50" cy="60" r="10" fill-opacity=".3"/>',
  perfume:
    '<rect x="28" y="40" width="44" height="48" rx="10"/><rect x="42" y="22" width="16" height="18" rx="3"/><rect x="38" y="12" width="24" height="10" rx="3"/><path d="M38 56h24" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none"/>',
  dumbbell:
    '<rect x="8" y="36" width="14" height="28" rx="4"/><rect x="22" y="30" width="12" height="40" rx="4"/><rect x="34" y="45" width="32" height="10" rx="3"/><rect x="66" y="30" width="12" height="40" rx="4"/><rect x="78" y="36" width="14" height="28" rx="4"/>',
  mat: '<rect x="20" y="22" width="60" height="56" rx="5" transform="rotate(-8 50 50)"/><path d="M28 36l44-6m-44 16 44-6m-44 16 44-6" stroke="#fff" stroke-opacity=".4" stroke-width="3" fill="none"/>',
  bat: '<path d="M60 8l14 14-36 44-12 14-8-8 14-12z"/><circle cx="72" cy="78" r="9"/>',
  toy: '<rect x="14" y="52" width="34" height="34" rx="6"/><rect x="52" y="52" width="34" height="34" rx="6"/><rect x="33" y="14" width="34" height="34" rx="6"/><circle cx="50" cy="31" r="7" fill="#fff" fill-opacity=".5"/>',
  baby: '<circle cx="50" cy="38" r="22"/><path d="M22 90c0-20 12-30 28-30s28 10 28 30z"/><circle cx="43" cy="36" r="3" fill="#fff"/><circle cx="57" cy="36" r="3" fill="#fff"/>',
  powerbank:
    '<rect x="28" y="12" width="44" height="76" rx="10"/><rect x="36" y="22" width="28" height="10" rx="3" fill-opacity=".35"/><path d="M52 44l-8 14h10l-6 14" stroke="#fff" stroke-opacity=".8" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  case: '<rect x="30" y="10" width="40" height="80" rx="9"/><circle cx="44" cy="26" r="8" fill-opacity=".35"/><circle cx="44" cy="26" r="3.5" fill="#fff" fill-opacity=".7"/>',
  generic:
    '<rect x="20" y="20" width="60" height="60" rx="14"/><circle cx="50" cy="50" r="14" fill-opacity=".3"/>',
};

export const ICON_KEYS = Object.keys(ICONS);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      out.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) out.push(cur.trim());
  const sliced = out.slice(0, lines);
  if (out.length > lines && sliced.length)
    sliced[sliced.length - 1] = `${sliced[sliced.length - 1]?.replace(/[.,]?$/, '')}…`;
  return sliced;
}

export function productSvg(opts: {
  seed: string;
  title: string;
  icon: string;
  variant: number;
  brand?: string;
  accent?: string;
}): string {
  const h = hash(opts.seed);
  const [c1, c2, accent] = PALETTES[h % PALETTES.length] as [string, string, string];
  const v = opts.variant % 4;
  const icon = ICONS[opts.icon] ?? ICONS['generic'];
  const scale = [3.9, 4.4, 3.5, 4.1][v] as number;
  const iconX = 400 - 50 * scale + [0, -26, 22, 0][v]!;
  const iconY = 330 - 50 * scale + [0, 10, -14, 22][v]!;
  const rot = [0, -8, 6, -3][v] as number;
  const title = wrap(opts.title, 26, 2);
  const blobs = [
    `<circle cx="${140 + v * 70}" cy="${130 + (h % 60)}" r="${190 + v * 10}" fill="#fff" fill-opacity=".10"/>`,
    `<circle cx="${700 - v * 40}" cy="${690 - (h % 50)}" r="${230}" fill="#000" fill-opacity=".10"/>`,
    `<circle cx="${640 - v * 30}" cy="140" r="${60 + (h % 30)}" fill="${accent}" fill-opacity=".85"/>`,
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${esc(opts.title)}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".28"/></filter></defs>
<rect width="800" height="800" fill="url(#g)"/>${blobs}
<g filter="url(#s)" transform="translate(${iconX} ${iconY}) rotate(${rot} ${50 * scale} ${50 * scale}) scale(${scale})" fill="#ffffff" fill-opacity=".96">${icon}</g>
${opts.brand ? `<text x="48" y="64" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="26" font-weight="700" letter-spacing="3" fill="#fff" fill-opacity=".85">${esc(opts.brand.toUpperCase())}</text>` : ''}
<rect x="0" y="650" width="800" height="150" fill="#000" fill-opacity=".22"/>
${title.map((l, i) => `<text x="48" y="${705 + i * 42}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="36" font-weight="700" fill="#fff">${esc(l)}</text>`).join('')}
</svg>`;
}

export function bannerSvg(opts: {
  seed: string;
  title: string;
  subtitle: string;
  cta?: string;
  icon: string;
  width?: number;
  height?: number;
}): string {
  const w = opts.width ?? 1600;
  const hgt = opts.height ?? 560;
  const h = hash(opts.seed);
  const [c1, c2, accent] = PALETTES[h % PALETTES.length] as [string, string, string];
  const icon = ICONS[opts.icon] ?? ICONS['generic'];
  const title = wrap(opts.title, 22, 2);
  const sub = wrap(opts.subtitle, 46, 2);
  const s = (hgt / 100) * 0.72;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" role="img" aria-label="${esc(opts.title)}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="${w}" height="${hgt}" fill="url(#g)"/>
<circle cx="${w * 0.78}" cy="${hgt * 0.55}" r="${hgt * 0.78}" fill="#fff" fill-opacity=".10"/>
<circle cx="${w * 0.95}" cy="${hgt * 0.1}" r="${hgt * 0.34}" fill="${accent}" fill-opacity=".9"/>
<circle cx="${w * 0.08}" cy="${hgt * 1.0}" r="${hgt * 0.5}" fill="#000" fill-opacity=".12"/>
<g transform="translate(${w * 0.66} ${hgt * 0.5 - 50 * s}) rotate(-6 ${50 * s} ${50 * s}) scale(${s})" fill="#fff" fill-opacity=".95">${icon}</g>
${title.map((l, i) => `<text x="${w * 0.06}" y="${hgt * 0.34 + i * hgt * 0.17}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="${hgt * 0.15}" font-weight="800" fill="#fff" letter-spacing="-1">${esc(l)}</text>`).join('')}
${sub.map((l, i) => `<text x="${w * 0.06}" y="${hgt * 0.34 + title.length * hgt * 0.17 + hgt * 0.04 + i * hgt * 0.075}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="${hgt * 0.058}" fill="#fff" fill-opacity=".9">${esc(l)}</text>`).join('')}
${opts.cta ? `<g><rect x="${w * 0.06}" y="${hgt * 0.78}" width="${hgt * 0.45}" height="${hgt * 0.13}" rx="${hgt * 0.065}" fill="${accent}"/><text x="${w * 0.06 + hgt * 0.225}" y="${hgt * 0.78 + hgt * 0.083}" text-anchor="middle" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="${hgt * 0.052}" font-weight="700" fill="#1c1917">${esc(opts.cta)}</text></g>` : ''}
</svg>`;
}
