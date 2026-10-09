import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adminListQuerySchema,
  paginationQuerySchema,
  payoutGenerateSchema,
  payoutSettleSchema,
  type AdminListQuery,
} from '@gk/validators';
import { CurrentSeller, ReqCtx, Roles } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext, SellerContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SellerGuard } from '../auth/guards';
import { PayoutsService } from './payouts.service';

@ApiTags('Seller · Payouts')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/payouts')
export class SellerPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(paginationQuerySchema) q: { page: number; limit: number },
  ) {
    return this.payouts.listForSeller(seller.id, q.page, q.limit);
  }

  @Get('balance')
  balance(@CurrentSeller() seller: SellerContext) {
    return this.payouts.balance(seller.id);
  }

  @Get(':id/items')
  items(@CurrentSeller() seller: SellerContext, @Param('id') id: string) {
    return this.payouts.settlementItems(seller.id, id);
  }
}

@ApiTags('Admin · Payouts')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @ZQuery(adminListQuerySchema.extend({ sellerId: z.string().optional() }))
    q: AdminListQuery & { sellerId?: string },
  ) {
    return this.payouts.adminList(q.page, q.limit, q.status, q.sellerId);
  }

  @Get('eligible')
  eligible() {
    return this.payouts.eligible();
  }

  @Post('generate')
  @HttpCode(200)
  async generate(
    @ZBody(payoutGenerateSchema) body: { sellerId?: string; upTo?: Date },
    @ReqCtx() ctx: RequestContext,
  ) {
    const res = await this.payouts.generate(body.sellerId, body.upTo);
    await this.audit.record(ctx, {
      action: 'payout.generate',
      entityType: 'Payout',
      metadata: { ...res, sellerId: body.sellerId },
    });
    return res;
  }

  @Post(':id/settle')
  @HttpCode(200)
  async settle(
    @Param('id') id: string,
    @ZBody(payoutSettleSchema) body: { reference: string; notes?: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    const p = await this.payouts.settle(id, body.reference, body.notes);
    await this.audit.record(ctx, {
      action: 'payout.settle',
      entityType: 'Payout',
      entityId: id,
      metadata: { reference: body.reference, amount: p.netAmount },
    });
    return p;
  }
}
