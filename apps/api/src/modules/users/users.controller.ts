import { Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateProfileSchema, type UpdateProfileInput } from '@gk/validators';
import { CurrentUser } from '../../common/decorators';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update name, phone or avatar' })
  update(@CurrentUser() user: AuthUser, @ZBody(updateProfileSchema) body: UpdateProfileInput) {
    return this.users.updateProfile(user.id, body);
  }
}
