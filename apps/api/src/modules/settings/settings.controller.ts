import { Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { siteSettingsSchema, type SiteSettingsInput } from '@gk/validators';
import { Public, ReqCtx, Roles } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Storefront settings: delivery fee, free-delivery threshold, COD rules',
  })
  getPublic() {
    return this.settings.getPublic();
  }
}

@ApiTags('Admin · Settings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  async update(@ZBody(siteSettingsSchema) body: SiteSettingsInput, @ReqCtx() ctx: RequestContext) {
    const before = await this.settings.get();
    const next = await this.settings.update(body);
    await this.audit.record(ctx, {
      action: 'settings.update',
      entityType: 'SiteSetting',
      entityId: 'site',
      metadata: { before, after: next },
    });
    return next;
  }
}
