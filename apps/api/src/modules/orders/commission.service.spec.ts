import { CommissionService } from './commission.service';
import type { PrismaService } from '../../infra/prisma.service';
import type { SettingsService } from '../settings/settings.service';

type Rule = {
  scope: 'SELLER' | 'CATEGORY' | 'GLOBAL';
  rate: number;
  sellerId?: string;
  category?: { path: string };
};

async function resolverFor(rules: Rule[], defaultCommissionRate = 10) {
  const prisma = {
    commissionRule: { findMany: jest.fn().mockResolvedValue(rules) },
  } as unknown as PrismaService;
  const settings = {
    get: jest.fn().mockResolvedValue({ defaultCommissionRate }),
  } as unknown as SettingsService;
  return new CommissionService(prisma, settings).resolver();
}

describe('CommissionService.resolver', () => {
  it('falls back to the default setting when no rules exist', async () => {
    const r = await resolverFor([], 12);
    expect(r.rateFor('s1', 'electronics/mobiles')).toBe(12);
  });

  it('prefers a global rule over the default setting', async () => {
    const r = await resolverFor([{ scope: 'GLOBAL', rate: 8 }], 12);
    expect(r.rateFor('s1', 'fashion')).toBe(8);
  });

  it('uses the nearest category rule walking up the tree', async () => {
    const r = await resolverFor([
      { scope: 'GLOBAL', rate: 8 },
      { scope: 'CATEGORY', rate: 5, category: { path: 'electronics' } },
      { scope: 'CATEGORY', rate: 3, category: { path: 'electronics/mobiles' } },
    ]);
    expect(r.rateFor('s1', 'electronics/mobiles/smartphones')).toBe(3);
    expect(r.rateFor('s1', 'electronics/laptops')).toBe(5);
    expect(r.rateFor('s1', 'fashion/men')).toBe(8);
  });

  it('lets a seller override beat every category rule', async () => {
    const r = await resolverFor([
      { scope: 'CATEGORY', rate: 3, category: { path: 'electronics/mobiles' } },
      { scope: 'SELLER', rate: 1.5, sellerId: 'vip' },
    ]);
    expect(r.rateFor('vip', 'electronics/mobiles')).toBe(1.5);
    expect(r.rateFor('other', 'electronics/mobiles')).toBe(3);
  });

  it('loads rules once for a whole cart', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new CommissionService(
      { commissionRule: { findMany } } as unknown as PrismaService,
      { get: async () => ({ defaultCommissionRate: 10 }) } as unknown as SettingsService,
    );
    const r = await svc.resolver();
    r.rateFor('a', 'x');
    r.rateFor('b', 'y');
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
