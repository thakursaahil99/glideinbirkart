import { Module } from '@nestjs/common';
import {
  AdminAuditController,
  AdminBannersController,
  AdminCommissionController,
  AdminNotificationsController,
  AdminOrdersController,
  AdminProductsController,
  AdminSellersController,
  AdminUsersController,
} from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [
    AdminUsersController,
    AdminSellersController,
    AdminProductsController,
    AdminOrdersController,
    AdminBannersController,
    AdminCommissionController,
    AdminNotificationsController,
    AdminAuditController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
