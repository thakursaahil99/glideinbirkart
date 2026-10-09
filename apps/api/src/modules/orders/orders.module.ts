import { Global, Module } from '@nestjs/common';
import { PaymentGateway } from '../payments/gateway';
import { PaymentsController } from '../payments/payments.controller';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from './checkout.service';
import { CommissionService } from './commission.service';
import { InvoiceService } from './invoice.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import {
  AdminReturnsController,
  ReturnsController,
  SellerReturnsController,
} from './returns.controller';
import { ReturnsService } from './returns.service';
import { SellerOrdersController } from './seller-orders.controller';
import { SellerOrdersService } from './seller-orders.service';

@Global()
@Module({
  controllers: [
    OrdersController,
    SellerOrdersController,
    ReturnsController,
    SellerReturnsController,
    AdminReturnsController,
    PaymentsController,
  ],
  providers: [
    PaymentGateway,
    PaymentsService,
    CommissionService,
    OrderLifecycleService,
    CheckoutService,
    OrdersService,
    SellerOrdersService,
    ReturnsService,
    InvoiceService,
  ],
  exports: [
    PaymentGateway,
    PaymentsService,
    CommissionService,
    OrderLifecycleService,
    CheckoutService,
    OrdersService,
    SellerOrdersService,
    ReturnsService,
    InvoiceService,
  ],
})
export class OrdersModule {}
