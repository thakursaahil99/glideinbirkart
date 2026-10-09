import { Global, Module } from '@nestjs/common';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Global()
@Module({
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
