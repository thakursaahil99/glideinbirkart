import { Module } from '@nestjs/common';
import { AdminDashboardController, SellerAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [SellerAnalyticsController, AdminDashboardController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
