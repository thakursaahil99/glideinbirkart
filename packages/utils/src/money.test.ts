import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  discountPercent,
  formatINR,
  fromPaise,
  round2,
  toPaise,
} from './money';

describe('paise conversion', () => {
  it('converts without floating point drift', () => {
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(fromPaise(1999)).toBe(19.99);
  });

  it('rounds to two decimals', () => {
    expect(round2(10.456)).toBe(10.46);
    expect(round2(10.454)).toBe(10.45);
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(1000000)).toBe('₹10,00,000');
  });

  it('shows paise only when needed or requested', () => {
    expect(formatINR(499)).toBe('₹499');
    expect(formatINR(499.5)).toBe('₹499.50');
    expect(formatINR(499, true)).toBe('₹499.00');
  });

  it('is safe on bad input', () => {
    expect(formatINR(Number.NaN)).toBe('₹0');
  });
});

describe('discountPercent', () => {
  it('floors the percentage off MRP', () => {
    expect(discountPercent(1000, 799)).toBe(20);
    expect(discountPercent(999, 500)).toBe(49);
  });

  it('returns 0 when there is no discount or MRP is invalid', () => {
    expect(discountPercent(500, 500)).toBe(0);
    expect(discountPercent(500, 600)).toBe(0);
    expect(discountPercent(0, 10)).toBe(0);
  });
});

describe('allocateProportionally', () => {
  it('always sums to the total (largest remainder)', () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...parts].sort()).toEqual([33, 33, 34]);
  });

  it('weights by value', () => {
    expect(allocateProportionally(1000, [3000, 1000])).toEqual([750, 250]);
  });

  it('handles empty and zero-weight inputs', () => {
    expect(allocateProportionally(50, [])).toEqual([]);
    expect(allocateProportionally(50, [0, 0])).toEqual([0, 0]);
  });

  it('never allocates more or less than the total across many lines', () => {
    const weights = [1999, 4999, 12999, 349, 799];
    for (const total of [1, 7, 333, 9999, 123457]) {
      expect(allocateProportionally(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
