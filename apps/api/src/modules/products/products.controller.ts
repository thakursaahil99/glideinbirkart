import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  pincodeCheckQuerySchema,
  productListQuerySchema,
  recommendedQuerySchema,
  searchTextQuerySchema,
  serviceablePincodeSchema,
  adminListQuerySchema,
  type AdminListQuery,
  type ProductListQuery,
  type ServiceablePincodeInput,
} from '@gk/validators';
import { OptionalUser, Public, ReqCtx, Roles, CurrentUser } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, RequestContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SearchService } from '../search/search.service';
import { DeliveryService } from '../settings/delivery.service';
import { HomeService } from './home.service';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly search: SearchService,
    private readonly home: HomeService,
    private readonly delivery: DeliveryService,
  ) {}

  @Public()
  @Get('home')
  @ApiOperation({
    summary: 'Home page sections: banners, categories, deals of the day, trending, best sellers…',
  })
  getHome() {
    return this.home.get();
  }

  @Public()
  @Get('products')
  @ApiOperation({
    summary: 'Product listing with filters, sort, facets and pagination (cached in Redis)',
  })
  list(@ZQuery(productListQuerySchema) query: ProductListQuery) {
    return this.search.list(query);
  }

  @Public()
  @Get('products/by-ids')
  @ApiOperation({ summary: 'Product cards for a comma-separated id list (guest recently-viewed)' })
  byIds(@Query('ids') ids = '') {
    return this.products.summaries(
      ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30),
    );
  }

  @Public()
  @Get('products/recommended')
  @ApiOperation({ summary: 'Personalised recommendations from views, wishlist and orders' })
  recommended(
    @OptionalUser() user: AuthUser | undefined,
    @ZQuery(recommendedQuerySchema) q: { viewed?: string[]; limit: number },
  ) {
    return this.products.recommended(user?.id, q.viewed, q.limit);
  }

  @ApiBearerAuth()
  @Get('products/recently-viewed')
  recentlyViewed(@CurrentUser() user: AuthUser) {
    return this.products.recentlyViewed(user.id);
  }

  @Public()
  @Get('products/:slug')
  @ApiOperation({
    summary: 'Product detail by slug: variants, options, specs, rating breakdown, breadcrumbs',
  })
  detail(@Param('slug') slug: string) {
    return this.products.detail(slug);
  }

  @Public()
  @Get('products/:id/similar')
  similar(@Param('id') id: string) {
    return this.products.similar(id);
  }

  @Public()
  @Get('products/:id/frequently-bought')
  fbt(@Param('id') id: string) {
    return this.products.frequentlyBoughtTogether(id);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('products/:id/view')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Record a product page view (feeds recently-viewed, trending and seller analytics)',
  })
  async view(@Param('id') id: string, @OptionalUser() user: AuthUser | undefined) {
    await this.products.trackView(id, user?.id);
  }

  // ── search ──
  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Full-text + typo-tolerant search (same filters as /products)' })
  searchProducts(@ZQuery(productListQuerySchema) query: ProductListQuery) {
    return this.search.list(query);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('search/suggest')
  @ApiOperation({ summary: 'Autocomplete: products, categories, brands and popular queries' })
  suggest(@ZQuery(searchTextQuerySchema) q: { q?: string }) {
    return this.search.suggest(q.q ?? '');
  }

  @Public()
  @Get('search/popular')
  popular() {
    return this.search.popular();
  }

  // ── delivery ──
  @Public()
  @Get('delivery/check')
  @ApiOperation({ summary: 'PIN code serviceability + delivery ETA' })
  check(@ZQuery(pincodeCheckQuerySchema) q: { pincode: string }) {
    return this.delivery.check(q.pincode);
  }
}

@ApiTags('Admin · Delivery')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/pincodes')
export class PincodesAdminController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@ZQuery(adminListQuerySchema) q: AdminListQuery) {
    return this.delivery.list(q.page, q.limit, q.q);
  }

  @Post()
  async create(
    @ZBody(serviceablePincodeSchema) body: ServiceablePincodeInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const row = await this.delivery.upsert(body);
    await this.audit.record(ctx, {
      action: 'pincode.create',
      entityType: 'ServiceablePincode',
      entityId: row.id,
      metadata: { pincode: row.pincode },
    });
    return row;
  }

  @Post(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @ZBody(serviceablePincodeSchema) body: ServiceablePincodeInput,
    @ReqCtx() ctx: RequestContext,
  ) {
    const row = await this.delivery.upsert({ ...body, id });
    await this.audit.record(ctx, {
      action: 'pincode.update',
      entityType: 'ServiceablePincode',
      entityId: id,
    });
    return row;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @ReqCtx() ctx: RequestContext) {
    await this.delivery.remove(id);
    await this.audit.record(ctx, {
      action: 'pincode.delete',
      entityType: 'ServiceablePincode',
      entityId: id,
    });
    return { id };
  }
}
