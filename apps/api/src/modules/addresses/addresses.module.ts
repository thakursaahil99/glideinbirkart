import { Module } from '@nestjs/common';
import { AddressesController } from './addresses.controller';
import { AddressesRepository } from './addresses.repository';
import { AddressesService } from './addresses.service';

@Module({
  controllers: [AddressesController],
  providers: [AddressesService, AddressesRepository],
  exports: [AddressesService, AddressesRepository],
})
export class AddressesModule {}
