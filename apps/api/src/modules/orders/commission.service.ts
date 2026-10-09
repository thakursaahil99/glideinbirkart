import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { num } from '../products/products.mapper';

export interface CommissionResolver {
  /** Percentage for a seller + category: seller override → nearest category rule → global → default setting. */
  rateFor(sellerId: string, categoryPath: string): number;
}

@Injectable()
export class CommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Loads all active rules once so a whole cart is resolved with a single query. */
  async resolver(): Promise<CommissionResolver> {
    const [rules, settings] = await Promise.all([
      this.prisma.commissionRule.findMany({
        where: { isActive: true },
        include: { category: { select: { path: true } } },
      }),
      this.settings.get(),
    ]);
    const bySeller = new Map<string, number>();
    const byCategoryPath = new Map<string, number>();
    let global: number | undefined;
    for (const r of rules) {
      if (r.scope === 'SELLER' && r.sellerId) bySeller.set(r.sellerId, num(r.rate));
      else if (r.scope === 'CATEGORY' && r.category)
        byCategoryPath.set(r.category.path, num(r.rate));
      else if (r.scope === 'GLOBAL') global = num(r.rate);
    }
    return {
      rateFor(sellerId, categoryPath) {
        const override = bySeller.get(sellerId);
        if (override !== undefined) return override;
        const segments = categoryPath.split('/');
        for (let i = segments.length; i >= 1; i--) {
          const rate = byCategoryPath.get(segments.slice(0, i).join('/'));
          if (rate !== undefined) return rate;
        }
        return global ?? settings.defaultCommissionRate;
      },
    };
  }
}
