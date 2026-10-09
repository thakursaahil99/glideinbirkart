import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  adminListQuerySchema,
  bannerInputSchema,
  broadcastSchema,
  blockUserSchema,
  cancelOrderSchema,
  commissionRuleInputSchema,
  kycReviewSchema,
  productRejectSchema,
  refundOrderSchema,
  sellerDecisionSchema,
  type AdminListQuery,
  type BannerOutput,
  type BroadcastOutput,
  type CommissionRuleInput,
  type SellerDecisionInput,
} from '@gk/validators';
import { CurrentUser, ReqCtx, Roles, SkipEnvelope } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { KycService } from '../kyc/kyc.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceService } from '../orders/invoice.service';
import { SellersService } from '../sellers/sellers.service';
import { AdminService } from './admin.service';

const auditQuery = adminListQuerySchema.extend({ actorId: z.string().optional() });

@ApiTags('Admin · Users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.admin.listUsers(q);
  }

  @Post(':id/block')
  @HttpCode(200)
  @ApiOperation({ summary: 'Block or unblock a user (sessions are revoked immediately)' })
  async block(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @ZBody(blockUserSchema) body: { blocked: boolean; reason?: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.admin.setBlocked(actor.id, actor.role, id, body.blocked, body.reason);
    await this.audit.record(ctx, {
      action: body.blocked ? 'user.block' : 'user.unblock',
      entityType: 'User',
      entityId: id,
      metadata: { reason: body.reason },
    });
    return { id, blocked: body.blocked };
  }
}

@ApiTags('Admin · Notifications')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Get('audience')
  @ApiOperation({ summary: 'How many users a broadcast would reach' })
  audience() {
    return this.notifications.audienceSize();
  }

  @Post('broadcast')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an offer or announcement to app users (inbox + push)' })
  async broadcast(@ZBody(broadcastSchema) body: BroadcastOutput, @ReqCtx() ctx: RequestContext) {
    const result = await this.notifications.broadcast({
      title: body.title,
      body: body.body,
      audience: body.audience,
      data: body.productSlug ? { productSlug: body.productSlug } : undefined,
    });
    await this.audit.record(ctx, {
      action: 'notification.broadcast',
      entityType: 'Notification',
      metadata: { title: body.title, audience: body.audience, ...result },
    });
    return result;
  }
}

@ApiTags('Admin · Sellers')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/sellers')
export class AdminSellersController {
  constructor(
    private readonly sellers: SellersService,
    private readonly kyc: KycService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Seller list / approval queue (filter status=PENDING)' })
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.sellers.adminList(q.page, q.limit, q.status, q.q, q.sort, q.order);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.sellers.adminDetail(id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  async decide(
    @Param('id') id: string,
    @ZBody(sellerDecisionSchema) body: SellerDecisionInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.sellers.decide(id, body);
    await this.audit.record(ctx, {
      action: `seller.${body.decision.toLowerCase()}`,
      entityType: 'SellerProfile',
      entityId: id,
      metadata: { remarks: body.remarks },
    });
    return r;
  }

  @Post('kyc/:docId/review')
  @HttpCode(200)
  async reviewKyc(
    @CurrentUser() actor: AuthUser,
    @Param('docId') docId: string,
    @ZBody(kycReviewSchema) body: { status: 'APPROVED' | 'REJECTED'; remarks?: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.kyc.review(docId, body.status, body.remarks, actor.id);
    await this.audit.record(ctx, {
      action: `kyc.${body.status.toLowerCase()}`,
      entityType: 'SellerKyc',
      entityId: docId,
      metadata: { remarks: body.remarks },
    });
    return r;
  }
}

@ApiTags('Admin · Product moderation')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Moderation queue (status=PENDING_REVIEW) and catalogue browser' })
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.admin.listProducts(q);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.admin.productDetail(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.admin.approveProduct(id);
    await this.audit.record(ctx, {
      action: 'product.approve',
      entityType: 'Product',
      entityId: id,
    });
    return { id, status: 'ACTIVE' };
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @ZBody(productRejectSchema) body: { reason: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.admin.rejectProduct(id, body.reason);
    await this.audit.record(ctx, {
      action: 'product.reject',
      entityType: 'Product',
      entityId: id,
      metadata: { reason: body.reason },
    });
    return { id, status: 'REJECTED' };
  }
}

@ApiTags('Admin · Orders')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly admin: AdminService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.admin.listOrders(q);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.admin.orderDetail(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @ZBody(cancelOrderSchema) body: { reason: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.admin.cancelOrder(actor.id, id, body.reason);
    await this.audit.record(ctx, {
      action: 'order.cancel',
      entityType: 'Order',
      entityId: id,
      metadata: { reason: body.reason },
    });
    return this.admin.orderDetail(id);
  }

  @Post(':id/refund')
  @HttpCode(200)
  async refund(
    @Param('id') id: string,
    @ZBody(refundOrderSchema) body: { amount: number; reason: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.admin.refundOrder(id, body.amount, body.reason);
    await this.audit.record(ctx, {
      action: 'order.refund',
      entityType: 'Order',
      entityId: id,
      metadata: body,
    });
    return this.admin.orderDetail(id);
  }

  @SkipEnvelope()
  @Get(':id/invoice')
  @Header('Content-Type', 'application/pdf')
  async invoice(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.invoices.invoiceForAdmin(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }
}

@ApiTags('Admin · Banners')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/banners')
export class AdminBannersController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.admin.listBanners();
  }

  @Post()
  async create(@ZBody(bannerInputSchema) body: BannerOutput, @ReqCtx() ctx: RequestContext) {
    const b = await this.admin.saveBanner(body);
    await this.audit.record(ctx, {
      action: 'banner.create',
      entityType: 'Banner',
      entityId: b.id,
      metadata: { title: b.title },
    });
    return b;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @ZBody(bannerInputSchema) body: BannerOutput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const b = await this.admin.saveBanner(body, id);
    await this.audit.record(ctx, { action: 'banner.update', entityType: 'Banner', entityId: id });
    return b;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.admin.removeBanner(id);
    await this.audit.record(ctx, { action: 'banner.delete', entityType: 'Banner', entityId: id });
    return { id };
  }
}

@ApiTags('Admin · Commission')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/commission-rules')
export class AdminCommissionController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.admin.listRules();
  }

  @Post()
  @ApiOperation({
    summary: 'Create or update a commission rule: global, per category, or per-seller override',
  })
  async save(
    @ZBody(commissionRuleInputSchema) body: CommissionRuleInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.admin.saveRule(body);
    await this.audit.record(ctx, {
      action: 'commission.save',
      entityType: 'CommissionRule',
      entityId: r.id,
      metadata: { scope: r.scope, rate: r.rate, categoryId: r.categoryId, sellerId: r.sellerId },
    });
    return r;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @ZBody(commissionRuleInputSchema) body: CommissionRuleInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.admin.saveRule(body, id);
    await this.audit.record(ctx, {
      action: 'commission.update',
      entityType: 'CommissionRule',
      entityId: id,
      metadata: { rate: r.rate },
    });
    return r;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.admin.removeRule(id);
    await this.audit.record(ctx, {
      action: 'commission.delete',
      entityType: 'CommissionRule',
      entityId: id,
    });
    return { id };
  }
}

@ApiTags('Admin · Audit')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@ZQuery(auditQuery) q: AdminListQuery & { actorId?: string }) {
    return this.admin.auditLogs(q);
  }
}
