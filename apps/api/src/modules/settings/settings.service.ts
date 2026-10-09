import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicSettings, SiteSettings } from '@gk/types';
import { Prisma } from '@gk/db';
import { PrismaService } from '../../infra/prisma.service';
import { CacheNs, CacheService } from '../../infra/cache.service';
import type { AppConfig } from '../../config/config.types';

export const DEFAULT_SETTINGS: SiteSettings = {
  deliveryFee: 49,
  freeDeliveryThreshold: 499,
  codEnabled: true,
  codMaxAmount: 50000,
  onlinePaymentsEnabled: true,
  supportEmail: 'support@glideinbirkart.in',
  supportPhone: '+91 80 4000 1234',
  defaultCommissionRate: 10,
  payoutHoldDays: 7,
  lowStockThreshold: 5,
};

const KEY = 'site';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async get(): Promise<SiteSettings> {
    return this.cache.wrapNs(CacheNs.settings, 'site', 300, async () => {
      const row = await this.prisma.siteSetting.findUnique({ where: { key: KEY } });
      return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<SiteSettings> | null) ?? {}) };
    });
  }

  async update(patch: SiteSettings): Promise<SiteSettings> {
    const next = { ...DEFAULT_SETTINGS, ...patch };
    await this.prisma.siteSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    await this.cache.bump(CacheNs.settings);
    return next;
  }

  async getPublic(): Promise<PublicSettings> {
    const s = await this.get();
    return {
      deliveryFee: s.deliveryFee,
      freeDeliveryThreshold: s.freeDeliveryThreshold,
      codEnabled: s.codEnabled,
      codMaxAmount: s.codMaxAmount,
      onlinePaymentsEnabled: s.onlinePaymentsEnabled,
      supportEmail: s.supportEmail,
      supportPhone: s.supportPhone,
      razorpayKeyId: this.config.get('RAZORPAY_KEY_ID', { infer: true }) ?? null,
      currency: 'INR',
    };
  }
}
