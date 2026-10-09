import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  inventoryUpdateSchema,
  productInputSchema,
  sellerProductQuerySchema,
  type InventoryUpdateInput,
  type ProductOutput,
  type SellerProductQuery,
} from '@gk/validators';
import { CurrentSeller, ReqCtx, Roles, SkipEnvelope } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext, SellerContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SellerGuard } from '../auth/guards';
import { BulkUploadService, csvTemplate } from './bulk-upload.service';
import { SellerProductsService } from './seller-products.service';

const statusActionSchema = z.object({ action: z.enum(['ARCHIVE', 'UNARCHIVE', 'SUBMIT']) });
const inventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  low: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(80).optional(),
});

@ApiTags('Seller · Products')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller')
export class SellerProductsController {
  constructor(
    private readonly products: SellerProductsService,
    private readonly bulk: BulkUploadService,
    private readonly audit: AuditService,
  ) {}

  @Get('products')
  list(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(sellerProductQuerySchema) q: SellerProductQuery,
  ) {
    return this.products.list(seller.id, q);
  }

  @SkipEnvelope()
  @Get('products/bulk/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="glideinbir-kart-products-template.csv"')
  @ApiOperation({ summary: 'Download the bulk upload CSV template' })
  template() {
    return csvTemplate();
  }

  @Post('products/bulk')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Bulk create / update products from a CSV; returns a per-row validation report',
  })
  async bulkUpload(
    @CurrentSeller() seller: SellerContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @ReqCtx() ctx: RequestContext,
  ) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Attach a CSV file in the "file" field');
    const report = await this.bulk.process(seller.id, file.buffer);
    await this.audit.record(ctx, {
      action: 'product.bulk_upload',
      entityType: 'Product',
      metadata: { ...report, errors: report.errors.slice(0, 20) },
    });
    return report;
  }

  @Get('products/:id')
  get(@CurrentSeller() seller: SellerContext, @Param('id') id: string) {
    return this.products.get(seller.id, id);
  }

  @Post('products')
  @ApiOperation({
    summary:
      'Create a product with variants, images and dynamic attributes (goes to moderation when submit=true)',
  })
  async create(
    @CurrentSeller() seller: SellerContext,
    @ZBody(productInputSchema) body: ProductOutput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const p = await this.products.create(seller.id, body);
    await this.audit.record(ctx, {
      action: 'product.create',
      entityType: 'Product',
      entityId: p.id,
      metadata: { name: p.name, status: p.status },
    });
    return p;
  }

  @Put('products/:id')
  async update(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @ZBody(productInputSchema) body: ProductOutput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const p = await this.products.update(seller.id, id, body);
    await this.audit.record(ctx, {
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      metadata: { status: p.status },
    });
    return p;
  }

  @Patch('products/:id/status')
  @ApiOperation({ summary: 'Archive / unarchive / submit for review' })
  async setStatus(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @ZBody(statusActionSchema) body: z.infer<typeof statusActionSchema>,
    @ReqCtx() ctx: RequestContext,
  ) {
    const p = await this.products.setStatus(seller.id, id, body.action);
    await this.audit.record(ctx, {
      action: `product.${body.action.toLowerCase()}`,
      entityType: 'Product',
      entityId: id,
    });
    return p;
  }

  @Delete('products/:id')
  async remove(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.products.remove(seller.id, id);
    await this.audit.record(ctx, { action: 'product.delete', entityType: 'Product', entityId: id });
    return { id };
  }

  // ── inventory ──
  @Get('inventory')
  @ApiOperation({ summary: 'Per-SKU stock levels (use ?low=true for low-stock alerts)' })
  inventory(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(inventoryQuerySchema) q: z.infer<typeof inventoryQuerySchema>,
  ) {
    return this.products.inventory(seller.id, q.page, q.limit, q.low === 'true', q.q);
  }

  @Patch('inventory/:variantId')
  async updateInventory(
    @CurrentSeller() seller: SellerContext,
    @Param('variantId') variantId: string,
    @ZBody(inventoryUpdateSchema) body: InventoryUpdateInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const row = await this.products.updateInventory(seller.id, variantId, body);
    await this.audit.record(ctx, {
      action: 'inventory.update',
      entityType: 'ProductVariant',
      entityId: variantId,
      metadata: { quantity: body.quantity },
    });
    return row;
  }
}
