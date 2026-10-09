import { Global, Module } from '@nestjs/common';
import { AdminPayoutsController, SellerPayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Global()
@Module({
  controllers: [SellerPayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
