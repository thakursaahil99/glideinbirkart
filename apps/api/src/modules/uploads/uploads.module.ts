import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

@Global()
@Module({
  controllers: [UploadsController, MediaController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadsModule {}
