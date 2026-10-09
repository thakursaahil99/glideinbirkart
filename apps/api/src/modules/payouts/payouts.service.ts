import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@gk/db';
import type { PayoutDto, SellerBalance } from '@gk/types';
import { fromPaise, toPaise } from '@gk/utils';
import type { AppConfig } from '../../config/config.types';
import { badRequest, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/mail.templates';
import { NotificationsService } from '../notifications/notifications.service';
import { num } from '../products/products.mapper';
import { SettingsService } from '../settings/settings.service';

type PayoutRow = Prisma.PayoutGetPayload<{ include: { seller: { select: { storeName: true } } } }>;

const toDto = (p: PayoutRow): PayoutDto => ({
  id: p.id,
  sellerId: p.sellerId,
  sellerName: p.seller.storeName,
  periodStart: p.periodStart.toISOString(),
  periodEnd: p.periodEnd.toISOString(),
  grossAmount: num(p.grossAmount),
  commissionAmount: num(p.commissionAmount),
  netAmount: num(p.netAmount),
  status: p.status,
  reference: p.reference,
  notes: p.notes,
  settledAt: p.settledAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
});

const DAY = 86_400_000;

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  /** Delivered sub-orders become payable once the return window (hold period) has passed. */
  private async eligibleBefore(upTo?: Date): Promise<Date> {
    const { payoutHoldDays } = await this.settings.get();
    const holdCutoff = new Date(Date.now() - payoutHoldDays * DAY);
    return upTo && upTo < holdCutoff ? upTo : holdCutoff;
  }

  async balance(sellerId: string): Promise<SellerBalance> {
    const cutoff = await this.eligibleBefore();
    const [unsettled, payouts, delivered] = await Promise.all([
      this.prisma.subOrder.findMany({
        where: { sellerId, status: 'DELIVERED', payoutId: null },
        select: { sellerEarning: true, deliveredAt: true },
      }),
      this.prisma.payout.groupBy({
        by: ['status'],
        where: { sellerId },
        _sum: { netAmount: true },
      }),
      this.prisma.subOrder.aggregate({
        where: { sellerId, status: { in: ['DELIVERED', 'RETURNED'] } },
        _sum: { commissionAmount: true, sellerEarning: true },
      }),
    ]);
    let pending = 0;
    let onHold = 0;
    for (const s of unsettled) {
      if (s.deliveredAt && s.deliveredAt <= cutoff) pending += toPaise(num(s.sellerEarning));
      else onHold += toPaise(num(s.sellerEarning));
    }
    const sum = (status: string) => num(payouts.find((p) => p.status === status)?._sum.netAmount);
    return {
      pending: fromPaise(pending) + sum('PENDING'),
      onHold: fromPaise(onHold),
      settled: sum('SETTLED'),
      lifetimeEarnings: num(delivered._sum.sellerEarning),
      commissionPaid: num(delivered._sum.commissionAmount),
    };
  }

  async listForSeller(
    sellerId: string,
    page: number,
    limit: number,
  ): Promise<PagedResult<PayoutDto>> {
    const where = { sellerId };
    const [rows, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        include: { seller: { select: { storeName: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.payout.count({ where }),
    ]);
    return paged(rows.map(toDto), page, limit, total);
  }

  /** Per-order earnings the seller can see in the settlement history. */
  async settlementItems(sellerId: string, payoutId: string) {
    const payout = await this.prisma.payout.findFirst({ where: { id: payoutId, sellerId } });
    if (!payout) throw notFound('Payout');
    const subs = await this.prisma.subOrder.findMany({
      where: { payoutId },
      select: {
        subOrderNumber: true,
        subtotal: true,
        commissionAmount: true,
        sellerEarning: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'asc' },
    });
    return subs.map((s) => ({
      subOrderNumber: s.subOrderNumber,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      gross: num(s.subtotal),
      commission: num(s.commissionAmount),
      net: num(s.sellerEarning),
    }));
  }

  // ───────────── admin ─────────────

  async adminList(
    page: number,
    limit: number,
    status?: string,
    sellerId?: string,
  ): Promise<PagedResult<PayoutDto>> {
    const where: Prisma.PayoutWhereInput = {
      ...(status ? { status: status as 'PENDING' | 'SETTLED' } : {}),
      ...(sellerId ? { sellerId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        include: { seller: { select: { storeName: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.payout.count({ where }),
    ]);
    return paged(rows.map(toDto), page, limit, total);
  }

  /** What each seller is currently owed, ready to be batched into a payout. */
  async eligible() {
    const cutoff = await this.eligibleBefore();
    const subs = await this.prisma.subOrder.findMany({
      where: { status: 'DELIVERED', payoutId: null, deliveredAt: { lte: cutoff } },
      select: {
        sellerId: true,
        subtotal: true,
        commissionAmount: true,
        sellerEarning: true,
        seller: { select: { storeName: true, bankAccountNumber: true, bankIfsc: true } },
      },
    });
    const bySeller = new Map<
      string,
      {
        sellerId: string;
        storeName: string;
        orders: number;
        gross: number;
        commission: number;
        net: number;
        bankReady: boolean;
      }
    >();
    for (const s of subs) {
      const cur = bySeller.get(s.sellerId) ?? {
        sellerId: s.sellerId,
        storeName: s.seller.storeName,
        orders: 0,
        gross: 0,
        commission: 0,
        net: 0,
        bankReady: Boolean(s.seller.bankAccountNumber && s.seller.bankIfsc),
      };
      cur.orders += 1;
      cur.gross += toPaise(num(s.subtotal));
      cur.commission += toPaise(num(s.commissionAmount));
      cur.net += toPaise(num(s.sellerEarning));
      bySeller.set(s.sellerId, cur);
    }
    return [...bySeller.values()]
      .map((v) => ({
        ...v,
        gross: fromPaise(v.gross),
        commission: fromPaise(v.commission),
        net: fromPaise(v.net),
      }))
      .sort((a, b) => b.net - a.net);
  }

  /** Batch eligible delivered sub-orders into PENDING payouts (one per seller). */
  async generate(sellerId?: string, upTo?: Date): Promise<{ created: number; total: number }> {
    const cutoff = await this.eligibleBefore(upTo);
    const subs = await this.prisma.subOrder.findMany({
      where: {
        status: 'DELIVERED',
        payoutId: null,
        deliveredAt: { lte: cutoff },
        ...(sellerId ? { sellerId } : {}),
      },
      select: {
        id: true,
        sellerId: true,
        subtotal: true,
        commissionAmount: true,
        sellerEarning: true,
        deliveredAt: true,
      },
    });
    const groups = new Map<string, typeof subs>();
    subs.forEach((s) => groups.set(s.sellerId, [...(groups.get(s.sellerId) ?? []), s]));
    if (groups.size === 0)
      throw badRequest('NOTHING_TO_PAY', 'No delivered orders are past the return window yet');

    let total = 0;
    for (const [sid, list] of groups) {
      const gross = list.reduce((n, s) => n + toPaise(num(s.subtotal)), 0);
      const commission = list.reduce((n, s) => n + toPaise(num(s.commissionAmount)), 0);
      const net = list.reduce((n, s) => n + toPaise(num(s.sellerEarning)), 0);
      if (net <= 0) continue;
      const dates = list.map((s) => s.deliveredAt?.getTime() ?? Date.now());
      await this.prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: {
            sellerId: sid,
            periodStart: new Date(Math.min(...dates)),
            periodEnd: new Date(Math.max(...dates)),
            grossAmount: fromPaise(gross),
            commissionAmount: fromPaise(commission),
            netAmount: fromPaise(net),
          },
        });
        await tx.subOrder.updateMany({
          where: { id: { in: list.map((s) => s.id) } },
          data: { payoutId: payout.id },
        });
      });
      total += net;
    }
    return { created: groups.size, total: fromPaise(total) };
  }

  async settle(id: string, reference: string, notes: string | undefined): Promise<PayoutDto> {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            storeName: true,
            userId: true,
            bankAccountNumber: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!payout) throw notFound('Payout');
    if (payout.status === 'SETTLED')
      throw badRequest('ALREADY_SETTLED', 'This payout is already settled');
    if (!payout.seller.bankAccountNumber)
      throw badRequest('NO_BANK', 'The seller has no bank account on file');
    const updated = await this.prisma.payout.update({
      where: { id },
      data: { status: 'SETTLED', reference, notes: notes ?? null, settledAt: new Date() },
      include: { seller: { select: { storeName: true } } },
    });
    await this.notifications.notify(payout.seller.userId, {
      type: 'PAYMENT',
      title: 'Payout settled',
      body: `₹${num(payout.netAmount).toLocaleString('en-IN')} was transferred. Ref: ${reference}`,
      data: { payoutId: id, link: '/seller/payouts' },
    });
    if (payout.seller.user.email) {
      await this.mail.send({
        to: payout.seller.user.email,
        ...mailTemplates.payoutSettled({
          name: payout.seller.user.name,
          amount: num(payout.netAmount),
          reference,
          url: `${this.config.get('WEB_URL', { infer: true }).replace(/\/$/, '')}/seller/payouts`,
        }),
      });
    }
    return toDto(updated);
  }
}
