/** All arithmetic that must be exact is done in integer paise, then converted back to rupees. */

export const toPaise = (rupees: number): number => Math.round((rupees + Number.EPSILON) * 100);
export const fromPaise = (paise: number): number => paise / 100;
export const round2 = (n: number): number => fromPaise(toPaise(n));

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,23,456 — pass `precise` for paise (₹1,23,456.50). */
export function formatINR(amount: number, precise = false): string {
  if (!Number.isFinite(amount)) return '₹0';
  if (precise || !Number.isInteger(amount)) return inrPrecise.format(amount);
  return inr.format(amount);
}

/** Percentage off MRP, rounded down to a whole number. 0 when there is no discount. */
export function discountPercent(mrp: number, price: number): number {
  if (!(mrp > 0) || price >= mrp) return 0;
  return Math.floor(((mrp - price) / mrp) * 100);
}

/**
 * Split `totalPaise` across `weights` proportionally using the largest-remainder method,
 * so the parts always add up to exactly `totalPaise`.
 */
export function allocateProportionally(totalPaise: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalPaise * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = totalPaise - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}
