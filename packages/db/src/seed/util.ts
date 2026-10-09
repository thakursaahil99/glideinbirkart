/** Deterministic helpers so every `pnpm db:seed` run produces the same demo catalogue. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = mulberry32(20261009);
export const rand = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)] as T;
export const chance = (p: number) => rng() < p;
export const daysAgo = (d: number, hours = 0) =>
  new Date(Date.now() - d * 86_400_000 - hours * 3_600_000);

export const API_URL = (process.env.API_PUBLIC_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

export const productImageUrl = (
  seed: string,
  title: string,
  icon: string,
  variant: number,
  brand?: string,
) =>
  `${API_URL}/api/v1/media/product/${seed}.svg?${qs({ t: title, i: icon, v: variant, b: brand })}`;

export const bannerImageUrl = (
  seed: string,
  title: string,
  subtitle: string,
  cta: string,
  icon: string,
  w = 1600,
  h = 560,
) =>
  `${API_URL}/api/v1/media/banner/${seed}.svg?${qs({ t: title, s: subtitle, c: cta, i: icon, w, h })}`;

export const indianNames = [
  'Aarav Sharma',
  'Vihaan Patel',
  'Ananya Iyer',
  'Diya Nair',
  'Rohan Gupta',
  'Ishaan Reddy',
  'Meera Kulkarni',
  'Kabir Singh',
  'Saanvi Joshi',
  'Arjun Menon',
  'Priya Das',
  'Aditya Verma',
  'Neha Bansal',
  'Rahul Mishra',
  'Sneha Pillai',
  'Karan Malhotra',
];

export const cities: Array<{ city: string; state: string; pincode: string }> = [
  { city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  { city: 'New Delhi', state: 'Delhi', pincode: '110001' },
  { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
  { city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
  { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  { city: 'Kolkata', state: 'West Bengal', pincode: '700001' },
  { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
  { city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
  { city: 'Kochi', state: 'Kerala', pincode: '682001' },
];
