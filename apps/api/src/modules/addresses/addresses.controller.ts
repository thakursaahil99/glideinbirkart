import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { addressSchema, type AddressOutput } from '@gk/validators';
import { CurrentUser } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { AddressesService } from './addresses.service';

@ApiTags('Addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'Address book' })
  list(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @ZBody(addressSchema) body: AddressOutput) {
    return this.addresses.create(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(addressSchema) body: AddressOutput,
  ) {
    return this.addresses.update(user.id, id, body);
  }

  @Patch(':id/default')
  @HttpCode(200)
  setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.addresses.setDefault(user.id, id);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.addresses.remove(user.id, id);
    return { id };
  }
}
