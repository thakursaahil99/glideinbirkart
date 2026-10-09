import { Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { cmsPageInputSchema, type CmsPageInput } from '@gk/validators';
import { Public, ReqCtx, Roles } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { CmsService } from './cms.service';

@ApiTags('CMS')
@Controller('cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Public()
  @Get()
  list() {
    return this.cms.listPublished();
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.cms.getPublished(slug);
  }
}

@ApiTags('Admin · CMS')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cms')
export class CmsAdminController {
  constructor(
    private readonly cms: CmsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.cms.adminList();
  }

  @Post()
  async create(@ZBody(cmsPageInputSchema) body: CmsPageInput, @ReqCtx() ctx: RequestContext) {
    const page = await this.cms.create(body);
    await this.audit.record(ctx, {
      action: 'cms.create',
      entityType: 'CmsPage',
      entityId: page.id,
      metadata: { slug: page.slug },
    });
    return page;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @ZBody(cmsPageInputSchema.partial()) body: Partial<CmsPageInput>,
    @ReqCtx() ctx: RequestContext,
  ) {
    const page = await this.cms.update(id, body);
    await this.audit.record(ctx, {
      action: 'cms.update',
      entityType: 'CmsPage',
      entityId: id,
      metadata: { slug: page.slug },
    });
    return page;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.cms.remove(id);
    await this.audit.record(ctx, { action: 'cms.delete', entityType: 'CmsPage', entityId: id });
    return { id };
  }
}
