import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  attributeInputSchema,
  brandInputSchema,
  categoryAttributesSchema,
  categoryInputSchema,
  categoryReorderSchema,
  type AttributeInput,
  type BrandInput,
  type CategoryAttributesInput,
  type CategoryInput,
  type CategoryReorderInput,
} from '@gk/validators';
import { Public, ReqCtx, Roles } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { AttributesService } from './attributes.service';
import { BrandsService } from './brands.service';
import { CategoriesService } from './categories.service';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly brands: BrandsService,
  ) {}

  @Public()
  @Get('categories')
  @ApiOperation({
    summary: 'Nested category tree with product counts (cached). Use ?flat=true for a flat list.',
  })
  list(@Query('flat') flat?: string) {
    return flat === 'true' ? this.categories.flat() : this.categories.tree();
  }

  @Public()
  @Get('categories/:slug')
  @ApiOperation({ summary: 'Category by slug with breadcrumbs' })
  bySlug(@Param('slug') slug: string) {
    return this.categories.bySlug(slug);
  }

  @Public()
  @Get('brands')
  listBrands() {
    return this.brands.list();
  }

  @ApiBearerAuth()
  @Roles('SELLER', 'ADMIN')
  @Get('catalog/categories/:id/attributes')
  @ApiOperation({
    summary: 'Dynamic attributes (incl. inherited) a product in this category must/can specify',
  })
  attributes(@Param('id') id: string) {
    return this.categories.attributesFor(id);
  }
}

@ApiTags('Admin · Catalog')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class CatalogAdminController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly brands: BrandsService,
    private readonly attributes: AttributesService,
    private readonly audit: AuditService,
  ) {}

  // ── categories ──
  @Get('categories')
  tree() {
    return this.categories.adminTree();
  }

  @Post('categories')
  async createCategory(
    @ZBody(categoryInputSchema) body: CategoryInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const c = await this.categories.create(body);
    await this.audit.record(ctx, {
      action: 'category.create',
      entityType: 'Category',
      entityId: c.id,
      metadata: { name: c.name },
    });
    return c;
  }

  @Put('categories/reorder')
  @HttpCode(200)
  @ApiOperation({ summary: 'Persist a drag-and-drop reorder / re-parent of the category tree' })
  async reorder(
    @ZBody(categoryReorderSchema) body: CategoryReorderInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const tree = await this.categories.reorder(body);
    await this.audit.record(ctx, {
      action: 'category.reorder',
      entityType: 'Category',
      metadata: { moved: body.nodes.length },
    });
    return tree;
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @ZBody(categoryInputSchema.partial()) body: Partial<CategoryInput>,
    @ReqCtx() ctx: RequestContext,
  ) {
    const c = await this.categories.update(id, body);
    await this.audit.record(ctx, {
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
      metadata: body,
    });
    return c;
  }

  @Delete('categories/:id')
  async removeCategory(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.categories.remove(id);
    await this.audit.record(ctx, {
      action: 'category.delete',
      entityType: 'Category',
      entityId: id,
    });
    return { id };
  }

  @Get('categories/:id/attributes')
  categoryAttributes(@Param('id') id: string) {
    return this.categories.attributesFor(id);
  }

  @Put('categories/:id/attributes')
  async setCategoryAttributes(
    @Param('id') id: string,
    @ZBody(categoryAttributesSchema) body: CategoryAttributesInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const res = await this.categories.setAttributes(id, body);
    await this.audit.record(ctx, {
      action: 'category.attributes',
      entityType: 'Category',
      entityId: id,
      metadata: { count: body.attributes.length },
    });
    return res;
  }

  // ── brands ──
  @Get('brands')
  listBrands() {
    return this.brands.adminList();
  }

  @Post('brands')
  async createBrand(@ZBody(brandInputSchema) body: BrandInput, @ReqCtx() ctx: RequestContext) {
    const b = await this.brands.create(body);
    await this.audit.record(ctx, {
      action: 'brand.create',
      entityType: 'Brand',
      entityId: b.id,
      metadata: { name: b.name },
    });
    return b;
  }

  @Patch('brands/:id')
  async updateBrand(
    @Param('id') id: string,
    @ZBody(brandInputSchema.partial()) body: Partial<BrandInput>,
    @ReqCtx() ctx: RequestContext,
  ) {
    const b = await this.brands.update(id, body);
    await this.audit.record(ctx, {
      action: 'brand.update',
      entityType: 'Brand',
      entityId: id,
      metadata: body,
    });
    return b;
  }

  @Delete('brands/:id')
  async removeBrand(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.brands.remove(id);
    await this.audit.record(ctx, { action: 'brand.delete', entityType: 'Brand', entityId: id });
    return { id };
  }

  // ── attributes ──
  @Get('attributes')
  listAttributes() {
    return this.attributes.list();
  }

  @Post('attributes')
  async createAttribute(
    @ZBody(attributeInputSchema) body: AttributeInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const a = await this.attributes.create(body);
    await this.audit.record(ctx, {
      action: 'attribute.create',
      entityType: 'Attribute',
      entityId: a.id,
      metadata: { name: a.name },
    });
    return a;
  }

  @Patch('attributes/:id')
  async updateAttribute(
    @Param('id') id: string,
    @ZBody(attributeInputSchema.partial()) body: Partial<AttributeInput>,
    @ReqCtx() ctx: RequestContext,
  ) {
    const a = await this.attributes.update(id, body);
    await this.audit.record(ctx, {
      action: 'attribute.update',
      entityType: 'Attribute',
      entityId: id,
    });
    return a;
  }

  @Delete('attributes/:id')
  async removeAttribute(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.attributes.remove(id);
    await this.audit.record(ctx, {
      action: 'attribute.delete',
      entityType: 'Attribute',
      entityId: id,
    });
    return { id };
  }
}
