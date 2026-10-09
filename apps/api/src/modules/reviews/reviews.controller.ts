import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  paginationQuerySchema,
  reviewInputSchema,
  reviewListQuerySchema,
  reviewReplySchema,
  type ReviewInput,
  type ReviewListQuery,
} from '@gk/validators';
import { CurrentSeller, CurrentUser, Public, ReqCtx, Roles } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, RequestContext, SellerContext } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { SellerGuard } from '../auth/guards';
import { ReviewsService } from './reviews.service';

const sellerReviewQuery = paginationQuerySchema.extend({
  unreplied: z.enum(['true', 'false']).optional(),
});

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('products/:id/reviews')
  @ApiOperation({
    summary:
      'Reviews for a product with rating breakdown (filters: rating, withImages; sort: recent|helpful|high|low)',
  })
  list(@Param('id') id: string, @ZQuery(reviewListQuerySchema) q: ReviewListQuery) {
    return this.reviews.listForProduct(id, q);
  }

  @ApiBearerAuth()
  @Get('products/:id/review-eligibility')
  eligibility(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviews.eligibility(user.id, id);
  }

  @ApiBearerAuth()
  @Post('reviews')
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @ZBody(reviewInputSchema) body: ReviewInput & { images: string[] },
  ) {
    return this.reviews.create(user.id, body);
  }

  @ApiBearerAuth()
  @Put('reviews/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(reviewInputSchema.partial()) body: Partial<ReviewInput>,
  ) {
    return this.reviews.update(user.id, id, body);
  }

  @ApiBearerAuth()
  @Delete('reviews/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.reviews.remove(user.id, id);
    return { id };
  }

  @ApiBearerAuth()
  @Post('reviews/:id/helpful')
  @HttpCode(200)
  helpful(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviews.markHelpful(user.id, id);
  }
}

@ApiTags('Seller · Reviews')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/reviews')
export class SellerReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(sellerReviewQuery) q: { page: number; limit: number; unreplied?: string },
  ) {
    return this.reviews.listForSeller(seller.id, q.page, q.limit, q.unreplied === 'true');
  }

  @Post(':id/reply')
  @HttpCode(200)
  async reply(
    @CurrentSeller() seller: SellerContext,
    @Param('id') id: string,
    @ZBody(reviewReplySchema) body: { body: string },
    @ReqCtx() ctx: RequestContext,
  ) {
    const r = await this.reviews.reply(seller.id, id, body.body);
    await this.audit.record(ctx, { action: 'review.reply', entityType: 'Review', entityId: id });
    return r;
  }
}

@ApiTags('Admin · Reviews')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  @Patch(':id/visibility')
  async visibility(
    @Param('id') id: string,
    @ZBody(z.object({ hidden: z.boolean() })) body: { hidden: boolean },
    @ReqCtx() ctx: RequestContext,
  ) {
    await this.reviews.setVisibility(id, body.hidden);
    await this.audit.record(ctx, {
      action: body.hidden ? 'review.hide' : 'review.unhide',
      entityType: 'Review',
      entityId: id,
    });
    return { id, hidden: body.hidden };
  }
}
