import { Module } from '@nestjs/common';
import { CmsAdminController, CmsController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({
  controllers: [CmsController, CmsAdminController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
