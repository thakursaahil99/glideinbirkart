import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { analyticsQuerySchema, type AnalyticsQuery } from '@gk/validators';
import { CurrentSeller, Roles } from '../../common/decorators';
import { ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { SellerContext } from '../../common/types';
import { SellerGuard } from '../auth/guards';
import { AnalyticsService } from './analytics.service';

@ApiTags('Seller · Analytics')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/analytics')
export class SellerAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@CurrentSeller() seller: SellerContext, @ZQuery(analyticsQuerySchema) q: AnalyticsQuery) {
    return this.analytics.seller(seller.id, q.from, q.to);
  }
}

@ApiTags('Admin · Dashboard')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@ZQuery(analyticsQuerySchema) q: AnalyticsQuery) {
    return this.analytics.admin(q.from, q.to);
  }
}
