import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  cancelSubOrderSchema,
  sellerOrderQuerySchema,
  shipSubOrderSchema,
  type SellerOrderQuery,
  type ShipSubOrderInput,
} from '@gk/validators';
import { CurrentSeller, CurrentUser, ReqCtx, Roles, SkipEnvelope } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, RequestContext, SellerContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SellerGuard } from '../auth/guards';
import { InvoiceService } from './invoice.service';
import { SellerOrdersService } from './seller-orders.service';

@ApiTags('Seller · Orders')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/orders')
export class SellerOrdersController {
  constructor(
    private readonly orders: SellerOrdersService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(sellerOrderQuerySchema) q: SellerOrderQuery,
  ) {
    return this.orders.list(seller.id, q);
  }

  @Get(':id')
  get(@CurrentSeller() seller: SellerContext, @Param('id') id: string) {
    return this.orders.detail(seller.id, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  async accept(
    @CurrentSeller() seller: SellerContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.orders.accept(seller.id, id, user.id);
    await this.audit.record(ctx, {
      action: 'suborder.accept',
      entityType: 'SubOrder',
      entityId: id,
    });
    return r;
  }

  @Post(':id/pack')
  @HttpCode(200)
  async pack(
    @CurrentSeller() seller: SellerContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.orders.pack(seller.id, id, user.id);
    await this.audit.record(ctx, { action: 'suborder.pack', entityType: 'SubOrder', entityId: id });
    return r;
  }

  @Post(':id/ship')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark as shipped with courier + tracking id' })
  async ship(
    @CurrentSeller() seller: SellerContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(shipSubOrderSchema) body: ShipSubOrderInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.orders.ship(seller.id, id, user.id, body);
    await this.audit.record(ctx, {
      action: 'suborder.ship',
      entityType: 'SubOrder',
      entityId: id,
      metadata: { courier: body.courier, trackingId: body.trackingId },
    });
    return r;
  }

  @Post(':id/deliver')
  @HttpCode(200)
  async deliver(
    @CurrentSeller() seller: SellerContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.orders.deliver(seller.id, id, user.id);
    await this.audit.record(ctx, {
      action: 'suborder.deliver',
      entityType: 'SubOrder',
      entityId: id,
    });
    return r;
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentSeller() seller: SellerContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(cancelSubOrderSchema) body: { reason: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.orders.cancel(seller.id, id, user.id, body.reason);
    await this.audit.record(ctx, {
      action: 'suborder.cancel',
      entityType: 'SubOrder',
      entityId: id,
      metadata: { reason: body.reason },
    });
    return r;
  }

  @SkipEnvelope()
  @Get(':id/label')
  @ApiOperation({ summary: 'Shipping label + packing slip PDF' })
  async label(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.invoices.packingSlip(seller.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }
}
