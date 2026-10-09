import { Global, Module } from '@nestjs/common';
import { CouponsAdminController, CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Global()
@Module({
  controllers: [CouponsController, CouponsAdminController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
