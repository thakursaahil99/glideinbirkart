import { Global, Module } from '@nestjs/common';
import { SearchService } from '../search/search.service';
import { DeliveryService } from '../settings/delivery.service';
import { BulkUploadService } from './bulk-upload.service';
import { SellerProductsController } from './seller-products.controller';
import { SellerProductsService } from './seller-products.service';
import { HomeService } from './home.service';
import { ProductAggregatesService } from './product-aggregates.service';
import { PincodesAdminController, ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Global()
@Module({
  controllers: [ProductsController, PincodesAdminController, SellerProductsController],
  providers: [
    SellerProductsService,
    BulkUploadService,
    ProductsService,
    ProductAggregatesService,
    HomeService,
    SearchService,
    DeliveryService,
  ],
  exports: [
    SellerProductsService,
    ProductsService,
    ProductAggregatesService,
    HomeService,
    SearchService,
    DeliveryService,
  ],
})
export class ProductsModule {}
