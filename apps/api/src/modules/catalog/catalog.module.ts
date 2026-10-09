import { Global, Module } from '@nestjs/common';
import { AttributesService } from './attributes.service';
import { BrandsService } from './brands.service';
import { CatalogAdminController, CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';

@Global()
@Module({
  controllers: [CatalogController, CatalogAdminController],
  providers: [CategoriesService, BrandsService, AttributesService],
  exports: [CategoriesService, BrandsService, AttributesService],
})
export class CatalogModule {}
