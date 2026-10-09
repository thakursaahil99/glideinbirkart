import { Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminListQuerySchema,
  couponInputSchema,
  type AdminListQuery,
  type CouponOutput,
} from '@gk/validators';
import { Public, ReqCtx, Roles } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { CouponsService } from './coupons.service';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get('available')
  @ApiOperation({ summary: 'Public offers that can be shown in the cart' })
  available() {
    return this.coupons.available();
  }
}

@ApiTags('Admin · Coupons')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/coupons')
export class CouponsAdminController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.coupons.adminList(q);
  }

  @Post()
  async create(@ZBody(couponInputSchema) body: CouponOutput, @ReqCtx() ctx: RequestContext) {
    const c = await this.coupons.create(body);
    await this.audit.record(ctx, {
      action: 'coupon.create',
      entityType: 'Coupon',
      entityId: c.id,
      metadata: { code: c.code, type: c.type, value: c.value },
    });
    return c;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @ZBody(couponInputSchema) body: CouponOutput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const c = await this.coupons.update(id, body);
    await this.audit.record(ctx, {
      action: 'coupon.update',
      entityType: 'Coupon',
      entityId: id,
      metadata: { code: c.code },
    });
    return c;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.coupons.remove(id);
    await this.audit.record(ctx, { action: 'coupon.delete', entityType: 'Coupon', entityId: id });
    return { id };
  }
}
