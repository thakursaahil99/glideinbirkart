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
import {
  kycDocumentSchema,
  sellerBankSchema,
  sellerBusinessSchema,
  sellerPickupSchema,
  sellerSettingsSchema,
  type KycDocumentInput,
  type SellerBankInput,
  type SellerBusinessInput,
  type SellerPickupInput,
} from '@gk/validators';
import { AllowUnapprovedSeller, CurrentSeller, CurrentUser, Roles } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, SellerContext } from '../../common/types';
import { SellerGuard } from '../auth/guards';
import { KycService } from '../kyc/kyc.service';
import { SellersService } from './sellers.service';

@ApiTags('Seller · Onboarding')
@ApiBearerAuth()
@Controller()
export class SellersController {
  constructor(
    private readonly sellers: SellersService,
    private readonly kyc: KycService,
  ) {}

  @Roles('CUSTOMER')
  @Post('sellers/apply')
  @ApiOperation({
    summary:
      'Start seller onboarding (business info + GSTIN + PAN). Upgrades the account to SELLER.',
  })
  apply(@CurrentUser() user: AuthUser, @ZBody(sellerBusinessSchema) body: SellerBusinessInput) {
    return this.sellers.apply(user.id, body);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Get('seller/profile')
  profile(@CurrentSeller() seller: SellerContext) {
    return this.sellers.getProfile(seller.id);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Put('seller/profile/business')
  business(
    @CurrentSeller() seller: SellerContext,
    @ZBody(sellerBusinessSchema) body: SellerBusinessInput,
  ) {
    return this.sellers.saveBusiness(seller.id, body);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Put('seller/profile/bank')
  bank(@CurrentSeller() seller: SellerContext, @ZBody(sellerBankSchema) body: SellerBankInput) {
    return this.sellers.saveBank(seller.id, body);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Put('seller/profile/pickup')
  pickup(
    @CurrentSeller() seller: SellerContext,
    @ZBody(sellerPickupSchema) body: SellerPickupInput,
  ) {
    return this.sellers.savePickup(seller.id, body);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @Patch('seller/settings')
  settings(
    @CurrentSeller() seller: SellerContext,
    @ZBody(sellerSettingsSchema) body: { description?: string; logoUrl?: string },
  ) {
    return this.sellers.updateStoreSettings(seller.id, body);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Post('seller/kyc')
  addKyc(@CurrentSeller() seller: SellerContext, @ZBody(kycDocumentSchema) body: KycDocumentInput) {
    return this.kyc.add(seller.id, body);
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Delete('seller/kyc/:id')
  async removeKyc(@CurrentSeller() seller: SellerContext, @Param('id') id: string) {
    await this.kyc.remove(seller.id, id);
    return { id };
  }

  @Roles('SELLER')
  @UseGuards(SellerGuard)
  @AllowUnapprovedSeller()
  @Post('seller/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit the application for admin review (PENDING)' })
  submit(@CurrentSeller() seller: SellerContext) {
    return this.sellers.submit(seller.id);
  }
}
