import { Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addToCartSchema,
  applyCouponSchema,
  mergeCartSchema,
  updateCartItemSchema,
  type AddToCartInput,
  type ApplyCouponInput,
  type UpdateCartItemInput,
} from '@gk/validators';
import { CurrentUser, OptionalUser, Public } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { CartService, type CartPrincipal } from './cart.service';

const GUEST_ID = /^[\w-]{8,64}$/;

function principal(
  user: AuthUser | undefined,
  guestId: string | undefined,
  required = true,
): CartPrincipal | null {
  if (user) return { userId: user.id };
  if (guestId && GUEST_ID.test(guestId)) return { guestId };
  if (required)
    throw badRequest(
      'CART_ID_REQUIRED',
      'Send an X-Guest-Cart-Id header (any random id) or sign in',
    );
  return null;
}

@ApiTags('Cart')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Guest-Cart-Id',
  required: false,
  description: 'Client-generated id for the guest cart (stored in Redis). Ignored when signed in.',
})
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Cart with live prices, stock checks and full price breakdown (guest or user)',
  })
  async view(
    @OptionalUser() user: AuthUser | undefined,
    @Headers('x-guest-cart-id') guestId?: string,
  ) {
    const p = principal(user, guestId, false);
    return p ? this.cart.view(p) : this.cart.view({ guestId: 'empty-cart-placeholder' });
  }

  @Public()
  @Post('items')
  @HttpCode(200)
  add(
    @OptionalUser() user: AuthUser | undefined,
    @Headers('x-guest-cart-id') guestId: string | undefined,
    @ZBody(addToCartSchema) body: AddToCartInput & { quantity: number },
  ) {
    return this.cart.add(
      principal(user, guestId) as CartPrincipal,
      body.variantId,
      body.quantity ?? 1,
    );
  }

  @Public()
  @Patch('items/:variantId')
  setQuantity(
    @OptionalUser() user: AuthUser | undefined,
    @Headers('x-guest-cart-id') guestId: string | undefined,
    @Param('variantId') variantId: string,
    @ZBody(updateCartItemSchema) body: UpdateCartItemInput,
  ) {
    return this.cart.setQuantity(
      principal(user, guestId) as CartPrincipal,
      variantId,
      body.quantity,
    );
  }

  @Public()
  @Delete('items/:variantId')
  remove(
    @OptionalUser() user: AuthUser | undefined,
    @Headers('x-guest-cart-id') guestId: string | undefined,
    @Param('variantId') variantId: string,
  ) {
    return this.cart.remove(principal(user, guestId) as CartPrincipal, variantId);
  }

  @Public()
  @Post('items/:variantId/save-for-later')
  @HttpCode(200)
  save(
    @OptionalUser() user: AuthUser | undefined,
    @Headers('x-guest-cart-id') guestId: string | undefined,
    @Param('variantId') variantId: string,
  ) {
    return this.cart.saveForLater(principal(user, guestId) as CartPrincipal, variantId);
  }

  @Public()
  @Post('items/:variantId/move-to-cart')
  @HttpCode(200)
  move(
    @OptionalUser() user: AuthUser | undefined,
    @Headers('x-guest-cart-id') guestId: string | undefined,
    @Param('variantId') variantId: string,
  ) {
    return this.cart.moveToCart(principal(user, guestId) as CartPrincipal, variantId);
  }

  @Public()
  @Delete()
  clear(@OptionalUser() user: AuthUser | undefined, @Headers('x-guest-cart-id') guestId?: string) {
    return this.cart.clear(principal(user, guestId) as CartPrincipal);
  }

  @Post('coupon')
  @HttpCode(200)
  applyCoupon(@CurrentUser() user: AuthUser, @ZBody(applyCouponSchema) body: ApplyCouponInput) {
    return this.cart.applyCoupon({ userId: user.id }, body.code);
  }

  @Delete('coupon')
  removeCoupon(@CurrentUser() user: AuthUser) {
    return this.cart.removeCoupon({ userId: user.id });
  }

  @Post('merge')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Merge the guest cart into the signed-in user cart (call right after login)',
  })
  merge(@CurrentUser() user: AuthUser, @ZBody(mergeCartSchema) body: { guestCartId: string }) {
    if (!GUEST_ID.test(body.guestCartId))
      throw badRequest('INVALID_CART_ID', 'Invalid guest cart id');
    return this.cart.mergeGuest(user.id, body.guestCartId);
  }
}
