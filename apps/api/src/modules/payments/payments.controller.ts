import { Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { paymentFailedSchema, verifyPaymentSchema, type VerifyPaymentInput } from '@gk/validators';
import { CurrentUser, Public } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { CheckoutService } from '../orders/checkout.service';
import { PaymentsService } from './payments.service';

const mockCompleteSchema = z.object({
  orderId: z.string().min(1),
  success: z.boolean().default(true),
});

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify the Razorpay signature after the checkout widget succeeds; confirms the order',
  })
  verify(@CurrentUser() user: AuthUser, @ZBody(verifyPaymentSchema) body: VerifyPaymentInput) {
    return this.payments.verify(user.id, body);
  }

  @Post('failed')
  @HttpCode(200)
  failed(
    @CurrentUser() user: AuthUser,
    @ZBody(paymentFailedSchema) body: { orderId: string; reason?: string },
  ) {
    return this.payments.markFailed(user.id, body.orderId, body.reason);
  }

  @Post('orders/:orderId/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Re-open payment for an order still inside its payment window' })
  retry(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.checkout.retryPayment(user.id, orderId);
  }

  @Post('mock/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: '[Mock gateway only] Simulate the Razorpay widget completing or being dismissed',
  })
  mockComplete(
    @CurrentUser() user: AuthUser,
    @ZBody(mockCompleteSchema) body: { orderId: string; success: boolean },
  ) {
    return this.payments.mockComplete(user.id, body.orderId, body.success);
  }

  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook (HMAC-verified, idempotent by event id)' })
  webhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    if (!req.rawBody) throw badRequest('NO_BODY', 'Empty webhook body');
    return this.payments.handleWebhook(req.rawBody, signature, eventId);
  }
}
