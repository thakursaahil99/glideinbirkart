import { Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { themeSettingsSchema } from '@gk/validators';
import type { ThemeSettings } from '@gk/types';
import { Public, ReqCtx, Roles } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { ThemeService } from './theme.service';

@ApiTags('Settings')
@Controller('theme')
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Look & feel (colours, fonts, logo, site name) for the website and mobile app',
  })
  get() {
    return this.theme.get();
  }
}

@ApiTags('Admin · Settings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/theme')
export class AdminThemeController {
  constructor(
    private readonly theme: ThemeService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get() {
    return this.theme.get();
  }

  @Put()
  async update(@ZBody(themeSettingsSchema) body: ThemeSettings, @ReqCtx() ctx: RequestContext) {
    const before = await this.theme.get();
    const next = await this.theme.update(body);
    await this.audit.record(ctx, {
      action: 'theme.update',
      entityType: 'SiteSetting',
      entityId: 'theme',
      metadata: { before, after: next },
    });
    return next;
  }

  @Post('reset')
  async reset(@ReqCtx() ctx: RequestContext) {
    const before = await this.theme.get();
    const next = await this.theme.reset();
    await this.audit.record(ctx, {
      action: 'theme.reset',
      entityType: 'SiteSetting',
      entityId: 'theme',
      metadata: { before },
    });
    return next;
  }
}
