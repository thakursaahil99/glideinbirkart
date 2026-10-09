import { Injectable } from '@nestjs/common';
import type { UserDto } from '@gk/types';
import type { UpdateProfileInput } from '@gk/validators';
import { conflict, notFound } from '../../common/errors';
import { AuthStateService } from '../auth/auth-state.service';
import { toUserDto } from './user.mapper';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly state: AuthStateService,
  ) {}

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw notFound('User');
    return toUserDto(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    const current = await this.users.findById(userId);
    if (!current) throw notFound('User');

    const phoneChanged = input.phone !== undefined && input.phone !== current.phone;
    if (phoneChanged && input.phone) {
      const taken = await this.users.findByPhone(input.phone);
      if (taken && taken.id !== userId)
        throw conflict('PHONE_EXISTS', 'This phone number is already linked to another account');
    }

    const updated = await this.users.update(userId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(phoneChanged ? { phone: input.phone, phoneVerifiedAt: null } : {}),
    });
    await this.state.invalidate(userId);
    return toUserDto(updated);
  }
}
