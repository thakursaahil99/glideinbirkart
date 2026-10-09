import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adminListQuerySchema,
  adminReturnDecisionSchema,
  paginationQuerySchema,
  returnDecisionSchema,
  returnRequestSchema,
  type AdminListQuery,
  type AdminReturnDecisionInput,
  type ReturnDecisionInput,
  type ReturnRequestInput,
} from '@gk/validators';
import type { ReturnStatus } from '@gk/types';
import { CurrentSeller, CurrentUser, ReqCtx, Roles } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, RequestContext, SellerContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SellerGuard } from '../auth/guards';
import { ReturnsService } from './returns.service';

const sellerReturnQuery = paginationQuerySchema.extend({
  status: z
    .enum([
      'REQUESTED',
      'APPROVED',
      'REJECTED',
      'ESCALATED',
      'PICKED_UP',
      'RECEIVED',
      'REFUNDED',
      'CLOSED',
    ])
    .optional(),
});
const escalateSchema = z.object({ note: z.string().trim().max(500).optional() });

@ApiTags('Returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  @HttpCode(201)
  request(
    @CurrentUser() user: AuthUser,
    @ZBody(returnRequestSchema) body: ReturnRequestInput & { images: string[] },
  ) {
    return this.returns.request(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @ZQuery(paginationQuerySchema) q: { page: number; limit: number },
  ) {
    return this.returns.listMine(user.id, q.page, q.limit);
  }

  @Post(':id/escalate')
  @HttpCode(200)
  escalate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(escalateSchema) body: { note?: string },
  ) {
    return this.returns.escalate(user.id, id, body.note);
  }
}

@ApiTags('Seller · Returns')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/returns')
export class SellerReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(sellerReturnQuery) q: { page: number; limit: number; status?: ReturnStatus },
  ) {
    return this.returns.listForSeller(seller.id, q.page, q.limit, q.status);
  }

  @Post(':id/decision')
  @HttpCode(200)
  async decide(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @ZBody(returnDecisionSchema) body: ReturnDecisionInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.returns.sellerDecide(seller.id, id, body);
    await this.audit.record(ctx, {
      action: `return.${body.decision.toLowerCase()}`,
      entityType: 'ReturnRequest',
      entityId: id,
      metadata: { remarks: body.remarks },
    });
    return r;
  }

  @Post(':id/received')
  @HttpCode(200)
  async received(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.returns.sellerMarkReceived(seller.id, id);
    await this.audit.record(ctx, {
      action: 'return.received',
      entityType: 'ReturnRequest',
      entityId: id,
    });
    return r;
  }
}

@ApiTags('Admin · Returns & Disputes')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.returns.adminList(q.page, q.limit, q.status, q.q);
  }

  @Post(':id/decision')
  @HttpCode(200)
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(adminReturnDecisionSchema) body: AdminReturnDecisionInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.returns.adminDecide(user.id, id, body);
    await this.audit.record(ctx, {
      action: `return.admin_${body.decision.toLowerCase()}`,
      entityType: 'ReturnRequest',
      entityId: id,
      metadata: { remarks: body.remarks, refundAmount: body.refundAmount },
    });
    return r;
  }
}
