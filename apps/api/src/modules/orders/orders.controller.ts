import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  cancelOrderSchema,
  checkoutSchema,
  orderListQuerySchema,
  type CancelOrderInput,
  type CheckoutInput,
  type OrderListQuery,
} from '@gk/validators';
import { CurrentUser, SkipEnvelope } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { CheckoutService } from './checkout.service';
import { InvoiceService } from './invoice.service';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly checkout: CheckoutService,
    private readonly invoices: InvoiceService,
  ) {}

  @Post('checkout')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Place an order: validates stock, reserves it, creates order + per-seller sub-orders + payment (transactional)',
  })
  placeOrder(@CurrentUser() user: AuthUser, @ZBody(checkoutSchema) body: CheckoutInput) {
    return this.checkout.placeOrder(user.id, body);
  }

  @Get('orders')
  list(@CurrentUser() user: AuthUser, @ZQuery(orderListQuerySchema) q: OrderListQuery) {
    return this.orders.list(user.id, q);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.get(user.id, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel before shipping — releases stock and refunds prepaid orders' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(cancelOrderSchema) body: CancelOrderInput,
  ) {
    return this.orders.cancel(user.id, id, body);
  }

  @SkipEnvelope()
  @Get('orders/:id/invoice')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Download the GST invoice PDF' })
  async invoice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.invoices.invoiceForCustomer(user.id, id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }
}
