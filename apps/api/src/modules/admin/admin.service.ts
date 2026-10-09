import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@gk/db';
import type {
  AdminBannerDto,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProductRow,
  AdminUserRow,
  AuditLogDto,
  CommissionRuleDto,
  SellerProductDto,
} from '@gk/types';
import { toPaise, fromPaise } from '@gk/utils';
import type { AdminListQuery, BannerOutput, CommissionRuleInput } from '@gk/validators';
import type { AppConfig } from '../../config/config.types';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { orderByFrom } from '../../common/utils/sort';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';
import { AuthStateService } from '../auth/auth-state.service';
import { TokensService } from '../auth/tokens.service';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/mail.templates';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { orderInclude, toHistory, toOrderDto } from '../orders/orders.mapper';
import { ProductAggregatesService } from '../products/product-aggregates.service';
import { num } from '../products/products.mapper';
import { SellerProductsService } from '../products/seller-products.service';

const likeSearch = (q: string) => ({ contains: q, mode: 'insensitive' as const });

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly tokens: TokensService,
    private readonly state: AuthStateService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly aggregates: ProductAggregatesService,
    private readonly sellerProducts: SellerProductsService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  private webUrl(path: string) {
    return `${this.config.get('WEB_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  // ───────────── users ─────────────

  async listUsers(q: AdminListQuery): Promise<PagedResult<AdminUserRow>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.role ? { role: q.role as AdminUserRow['role'] } : {}),
      ...(q.status ? { status: q.status as 'ACTIVE' | 'BLOCKED' } : {}),
      ...(q.q
        ? {
            OR: [
              { name: likeSearch(q.q) },
              { email: likeSearch(q.q) },
              { phone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: orderByFrom(
          q.sort,
          q.order,
          { createdAt: 'createdAt', name: 'name', email: 'email', lastLoginAt: 'lastLoginAt' },
          { createdAt: 'desc' as const },
        ) as Prisma.UserOrderByWithRelationInput,
        include: { _count: { select: { orders: true } } },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(
      rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        orderCount: u._count.orders,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      q.page,
      q.limit,
      total,
    );
  }

  async setBlocked(
    actorId: string,
    actorRole: string,
    userId: string,
    blocked: boolean,
    reason?: string,
  ): Promise<void> {
    if (actorId === userId) throw badRequest('SELF_BLOCK', 'You cannot block your own account');
    const target = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!target) throw notFound('User');
    if (['ADMIN', 'SUPER_ADMIN'].includes(target.role) && actorRole !== 'SUPER_ADMIN')
      throw forbidden('Only a super admin can block staff accounts');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: blocked ? 'BLOCKED' : 'ACTIVE',
        blockedReason: blocked ? (reason ?? null) : null,
      },
    });
    if (blocked)
      await this.tokens.revokeAllForUser(userId); // kills live sessions immediately
    else await this.state.invalidate(userId);
  }

  // ───────────── product moderation ─────────────

  async listProducts(q: AdminListQuery): Promise<PagedResult<AdminProductRow>> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status as AdminProductRow['status'] } : {}),
      ...(q.q
        ? { OR: [{ name: likeSearch(q.q) }, { seller: { storeName: likeSearch(q.q) } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: orderByFrom(
          q.sort,
          q.order,
          {
            createdAt: 'createdAt',
            name: 'name',
            minPrice: 'minPrice',
            soldCount: 'soldCount',
            totalStock: 'totalStock',
          },
          q.status === 'PENDING_REVIEW'
            ? { updatedAt: 'asc' as const }
            : { createdAt: 'desc' as const },
        ) as Prisma.ProductOrderByWithRelationInput,
        include: {
          category: { select: { name: true } },
          brand: { select: { name: true } },
          seller: { select: { storeName: true } },
          images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          _count: { select: { variants: { where: { deletedAt: null } } } },
        },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paged(
      rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        image: p.images[0]?.url ?? null,
        status: p.status,
        rejectionReason: p.rejectionReason,
        categoryName: p.category.name,
        minPrice: num(p.minPrice),
        totalStock: p.totalStock,
        variantCount: p._count.variants,
        soldCount: p.soldCount,
        createdAt: p.createdAt.toISOString(),
        sellerName: p.seller.storeName,
        brandName: p.brand?.name ?? null,
      })),
      q.page,
      q.limit,
      total,
    );
  }

  async productDetail(
    id: string,
  ): Promise<SellerProductDto & { sellerName: string; sellerId: string }> {
    const p = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { sellerId: true, seller: { select: { storeName: true } } },
    });
    if (!p) throw notFound('Product');
    const dto = await this.sellerProducts.get(p.sellerId, id);
    return { ...dto, sellerName: p.seller.storeName, sellerId: p.sellerId };
  }

  async approveProduct(id: string): Promise<void> {
    const p = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { seller: { include: { user: true } } },
    });
    if (!p) throw notFound('Product');
    if (p.status !== 'PENDING_REVIEW')
      throw badRequest('INVALID_STATE', 'Only products awaiting review can be approved');
    await this.prisma.product.update({
      where: { id },
      data: { status: 'ACTIVE', rejectionReason: null, publishedAt: p.publishedAt ?? new Date() },
    });
    await this.afterModeration(id);
    await this.notifications.notify(p.seller.userId, {
      type: 'PRODUCT',
      title: 'Product approved',
      body: `"${p.name}" is now live.`,
      data: { productId: id, link: `/seller/products/${id}` },
    });
    if (p.seller.user.email)
      await this.mail.send({
        to: p.seller.user.email,
        ...mailTemplates.productDecision({
          name: p.seller.user.name,
          product: p.name,
          approved: true,
          url: this.webUrl(`/products/${p.slug}`),
        }),
      });
  }

  async rejectProduct(id: string, reason: string): Promise<void> {
    const p = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { seller: { include: { user: true } } },
    });
    if (!p) throw notFound('Product');
    if (!['PENDING_REVIEW', 'ACTIVE'].includes(p.status))
      throw badRequest('INVALID_STATE', 'This product cannot be rejected from its current state');
    await this.prisma.product.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason },
    });
    await this.afterModeration(id);
    await this.notifications.notify(p.seller.userId, {
      type: 'PRODUCT',
      title: 'Product needs changes',
      body: `"${p.name}" was rejected: ${reason}`,
      data: { productId: id, link: `/seller/products/${id}` },
    });
    if (p.seller.user.email)
      await this.mail.send({
        to: p.seller.user.email,
        ...mailTemplates.productDecision({
          name: p.seller.user.name,
          product: p.name,
          approved: false,
          reason,
          url: this.webUrl(`/seller/products/${id}`),
        }),
      });
  }

  private async afterModeration(id: string) {
    await this.aggregates.invalidateDetail([id]);
    await this.aggregates.bumpListings();
  }

  // ───────────── orders ─────────────

  async listOrders(q: AdminListQuery): Promise<PagedResult<AdminOrderRow>> {
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status as AdminOrderRow['status'] } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lt: new Date(q.to.getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { orderNumber: likeSearch(q.q) },
              { user: { name: likeSearch(q.q) } },
              { user: { email: likeSearch(q.q) } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: orderByFrom(
          q.sort,
          q.order,
          { createdAt: 'createdAt', total: 'total', orderNumber: 'orderNumber' },
          { createdAt: 'desc' as const },
        ) as Prisma.OrderOrderByWithRelationInput,
        include: {
          user: { select: { name: true } },
          payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          items: { select: { quantity: true } },
        },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.order.count({ where }),
    ]);
    return paged(
      rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.user.name,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.payments[0]?.status ?? 'PENDING',
        total: num(o.total),
        itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        createdAt: o.createdAt.toISOString(),
      })),
      q.page,
      q.limit,
      total,
    );
  }

  async orderDetail(id: string): Promise<AdminOrderDetail> {
    const o = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...orderInclude,
        user: { select: { id: true, name: true, email: true, phone: true } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!o) throw notFound('Order');
    const dto = toOrderDto(o);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      customer: o.user,
      shippingAddress: dto.shippingAddress,
      paymentMethod: o.paymentMethod,
      paymentStatus: dto.paymentStatus,
      total: num(o.total),
      subOrders: dto.subOrders.map((s) => ({
        id: s.id,
        subOrderNumber: s.subOrderNumber,
        status: s.status,
        sellerName: s.seller.storeName,
        items: s.items,
        total: s.total,
        courier: s.courier,
        trackingId: s.trackingId,
      })),
      refunds: o.refunds.map((r) => ({
        id: r.id,
        amount: num(r.amount),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reason: r.reason,
      })),
      timeline: o.statusHistory.map(toHistory),
      createdAt: o.createdAt.toISOString(),
    };
  }

  async cancelOrder(actorId: string, id: string, reason: string): Promise<void> {
    const o = await this.prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!o) throw notFound('Order');
    await this.lifecycle.cancelOrder(id, { reason, actorId, actorLabel: 'Admin' });
  }

  /** Goodwill / dispute refund on a paid order, capped at what is still refundable. */
  async refundOrder(id: string, amount: number, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw notFound('Order');
    const payment = order.payments[0];
    if (!payment || !['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status))
      throw badRequest('NOT_PAID', 'This order has no captured payment to refund');
    const done = await this.prisma.refund.aggregate({
      where: { orderId: id, status: { not: 'FAILED' } },
      _sum: { amount: true },
    });
    const remaining = toPaise(num(payment.amount)) - toPaise(num(done._sum.amount));
    if (toPaise(amount) > remaining)
      throw conflict('EXCEEDS_REFUNDABLE', `Only ₹${fromPaise(remaining)} can still be refunded`);
    const refund = await this.prisma.refund.create({
      data: { orderId: id, paymentId: payment.id, amount, reason, notes: 'Admin refund' },
    });
    await this.lifecycle.processRefund(refund.id);
  }

  // ───────────── banners ─────────────

  private bannerDto(b: Prisma.BannerGetPayload<object>): AdminBannerDto {
    return {
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      mobileImageUrl: b.mobileImageUrl,
      linkUrl: b.linkUrl,
      ctaText: b.ctaText,
      bgColor: b.bgColor,
      placement: b.placement,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      startsAt: b.startsAt?.toISOString() ?? null,
      endsAt: b.endsAt?.toISOString() ?? null,
    };
  }

  async listBanners(): Promise<AdminBannerDto[]> {
    return (
      await this.prisma.banner.findMany({ orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }] })
    ).map((b) => this.bannerDto(b));
  }

  async saveBanner(input: BannerOutput, id?: string): Promise<AdminBannerDto> {
    const data = {
      title: input.title,
      subtitle: input.subtitle || null,
      imageUrl: input.imageUrl,
      mobileImageUrl: input.mobileImageUrl || null,
      linkUrl: input.linkUrl || null,
      ctaText: input.ctaText || null,
      bgColor: input.bgColor || null,
      placement: input.placement ?? 'HERO',
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    };
    const row = id
      ? await this.prisma.banner.update({ where: { id }, data }).catch(() => {
          throw notFound('Banner');
        })
      : await this.prisma.banner.create({ data });
    await this.cache.bump(CacheNs.products);
    return this.bannerDto(row);
  }

  async removeBanner(id: string): Promise<void> {
    await this.prisma.banner.delete({ where: { id } }).catch(() => {
      throw notFound('Banner');
    });
    await this.cache.bump(CacheNs.products);
  }

  // ───────────── commission rules ─────────────

  private async ruleDto(
    r: Prisma.CommissionRuleGetPayload<{
      include: { category: { select: { name: true } }; seller: { select: { storeName: true } } };
    }>,
  ): Promise<CommissionRuleDto> {
    return {
      id: r.id,
      scope: r.scope,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      sellerId: r.sellerId,
      sellerName: r.seller?.storeName ?? null,
      rate: num(r.rate),
      isActive: r.isActive,
    };
  }

  async listRules(): Promise<CommissionRuleDto[]> {
    const rows = await this.prisma.commissionRule.findMany({
      include: { category: { select: { name: true } }, seller: { select: { storeName: true } } },
      orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.ruleDto(r)));
  }

  /** One rule per (scope, target): saving again for the same target updates it instead of stacking duplicates. */
  async saveRule(input: CommissionRuleInput, id?: string): Promise<CommissionRuleDto> {
    const target = {
      scope: input.scope,
      categoryId: input.scope === 'CATEGORY' ? input.categoryId : null,
      sellerId: input.scope === 'SELLER' ? input.sellerId : null,
    };
    const existing = id
      ? await this.prisma.commissionRule.findUnique({ where: { id } })
      : await this.prisma.commissionRule.findFirst({ where: target });
    const data = { ...target, rate: input.rate, isActive: input.isActive ?? true };
    const row = existing
      ? await this.prisma.commissionRule.update({
          where: { id: existing.id },
          data,
          include: {
            category: { select: { name: true } },
            seller: { select: { storeName: true } },
          },
        })
      : await this.prisma.commissionRule.create({
          data,
          include: {
            category: { select: { name: true } },
            seller: { select: { storeName: true } },
          },
        });
    return this.ruleDto(row);
  }

  async removeRule(id: string): Promise<void> {
    await this.prisma.commissionRule.delete({ where: { id } }).catch(() => {
      throw notFound('Commission rule');
    });
  }

  // ───────────── audit logs ─────────────

  async auditLogs(q: AdminListQuery & { actorId?: string }): Promise<PagedResult<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lt: new Date(q.to.getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { action: likeSearch(q.q) },
              { entityId: q.q },
              { actor: { name: likeSearch(q.q) } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, role: true } } },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(
      rows.map((l) => ({
        id: l.id,
        actor: l.actor,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: (l.metadata as Record<string, unknown> | null) ?? null,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
      })),
      q.page,
      q.limit,
      total,
    );
  }
}
