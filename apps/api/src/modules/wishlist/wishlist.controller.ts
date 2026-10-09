import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { paginationQuerySchema, wishlistToggleSchema } from '@gk/validators';
import { CurrentUser } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @ZQuery(paginationQuerySchema) q: { page: number; limit: number },
  ) {
    return this.wishlist.list(user.id, q.page, q.limit);
  }

  @Get('ids')
  ids(@CurrentUser() user: AuthUser) {
    return this.wishlist.ids(user.id);
  }

  @Post()
  @HttpCode(200)
  add(@CurrentUser() user: AuthUser, @ZBody(wishlistToggleSchema) body: { productId: string }) {
    return this.wishlist.add(user.id, body.productId);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.wishlist.remove(user.id, productId);
  }
}
