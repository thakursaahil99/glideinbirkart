import { daysIn, resolveRange, startOfDayIst } from './date-range';
import { sanitizeDeep, sanitizeString } from './sanitize';
import { orderByFrom } from './sort';
import { uniqueSlug } from './slug';

describe('sanitize', () => {
  it('strips HTML tags and control characters', () => {
    expect(sanitizeString('  <script>alert(1)</script>Hello\u0000 <b>world</b> ')).toBe(
      'alert(1)Hello world',
    );
  });

  it('cleans nested structures but leaves secrets and markdown untouched', () => {
    const out = sanitizeDeep({
      name: '<i>Asha</i>',
      password: 'p<a>ss',
      content: '# <b>Heading</b>',
      tags: ['<u>one</u>', 'two'],
      nested: { note: '<img src=x onerror=1>hi' },
      when: new Date('2026-01-01T00:00:00Z'),
      n: 5,
    });
    expect(out.name).toBe('Asha');
    expect(out.password).toBe('p<a>ss');
    expect(out.content).toBe('# <b>Heading</b>');
    expect(out.tags).toEqual(['one', 'two']);
    expect(out.nested.note).toBe('hi');
    expect(out.when).toBeInstanceOf(Date);
    expect(out.n).toBe(5);
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when free', async () => {
    await expect(uniqueSlug('Blue Denim Jacket', async () => false)).resolves.toBe(
      'blue-denim-jacket',
    );
  });

  it('appends a counter on collisions', async () => {
    const taken = new Set(['blue-denim-jacket', 'blue-denim-jacket-2']);
    await expect(uniqueSlug('Blue Denim Jacket', async (s) => taken.has(s))).resolves.toBe(
      'blue-denim-jacket-3',
    );
  });

  it('falls back when the input has no usable characters', async () => {
    await expect(uniqueSlug('!!!', async () => false, 'category')).resolves.toBe('category');
  });
});

describe('orderByFrom', () => {
  const allowed = { price: 'minPrice', name: 'name' };
  it('maps only whitelisted keys', () => {
    expect(orderByFrom('price', 'asc', allowed, { createdAt: 'desc' })).toEqual({
      minPrice: 'asc',
    });
    expect(orderByFrom('name', undefined, allowed, { createdAt: 'desc' })).toEqual({
      name: 'desc',
    });
  });
  it('ignores unknown keys so clients cannot inject column names', () => {
    expect(orderByFrom('passwordHash; DROP TABLE', 'asc', allowed, { createdAt: 'desc' })).toEqual({
      createdAt: 'desc',
    });
    expect(orderByFrom(undefined, 'asc', allowed, { createdAt: 'desc' })).toEqual({
      createdAt: 'desc',
    });
  });
});

describe('IST date ranges', () => {
  it('finds the start of the IST day (UTC+5:30)', () => {
    // 2026-03-10 20:00 UTC is already 01:30 on the 11th in India
    expect(startOfDayIst(new Date('2026-03-10T20:00:00Z')).toISOString()).toBe(
      '2026-03-10T18:30:00.000Z',
    );
    expect(startOfDayIst(new Date('2026-03-10T10:00:00Z')).toISOString()).toBe(
      '2026-03-09T18:30:00.000Z',
    );
  });

  it('builds an inclusive range with an exclusive upper bound', () => {
    const r = resolveRange(new Date('2026-03-01T06:00:00Z'), new Date('2026-03-03T06:00:00Z'));
    expect(daysIn(r)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('swaps an inverted range to a single day and caps very long ranges', () => {
    const inverted = resolveRange(
      new Date('2026-03-10T06:00:00Z'),
      new Date('2026-03-01T06:00:00Z'),
    );
    expect(daysIn(inverted)).toHaveLength(1);
    const long = resolveRange(new Date('2020-01-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'));
    expect(daysIn(long).length).toBeLessThanOrEqual(366);
  });

  it('defaults to the last 30 days', () => {
    expect(daysIn(resolveRange())).toHaveLength(30);
  });
});
