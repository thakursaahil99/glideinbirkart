import { Injectable } from '@nestjs/common';
import type { AddressDto } from '@gk/types';
import type { AddressOutput } from '@gk/validators';
import { badRequest, notFound } from '../../common/errors';
import { AddressesRepository } from './addresses.repository';

const MAX_ADDRESSES = 15;

export const toAddressDto = (a: {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type: AddressDto['type'];
  isDefault: boolean;
}): AddressDto => ({
  id: a.id,
  fullName: a.fullName,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  landmark: a.landmark,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
  country: a.country,
  type: a.type,
  isDefault: a.isDefault,
});

@Injectable()
export class AddressesService {
  constructor(private readonly repo: AddressesRepository) {}

  async list(userId: string): Promise<AddressDto[]> {
    return (await this.repo.list(userId)).map(toAddressDto);
  }

  async create(userId: string, input: AddressOutput): Promise<AddressDto> {
    const count = await this.repo.count(userId);
    if (count >= MAX_ADDRESSES)
      throw badRequest('ADDRESS_LIMIT', `You can save up to ${MAX_ADDRESSES} addresses`);
    const created = await this.repo.create(userId, {
      ...input,
      // validated upstream; spelled out because zod infers every key as optional when TS runs without strict mode
      phone: String(input.phone),
      line2: input.line2 || null,
      landmark: input.landmark || null,
      isDefault: count === 0 ? true : input.isDefault,
    });
    return toAddressDto(created);
  }

  async update(userId: string, id: string, input: AddressOutput): Promise<AddressDto> {
    const existing = await this.repo.find(userId, id);
    if (!existing) throw notFound('Address');
    const updated = await this.repo.update(userId, id, {
      ...input,
      line2: input.line2 || null,
      landmark: input.landmark || null,
      isDefault: existing.isDefault ? true : input.isDefault,
    });
    return toAddressDto(updated);
  }

  async setDefault(userId: string, id: string): Promise<AddressDto> {
    const existing = await this.repo.find(userId, id);
    if (!existing) throw notFound('Address');
    return toAddressDto(await this.repo.update(userId, id, { isDefault: true }));
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.repo.find(userId, id);
    if (!existing) throw notFound('Address');
    await this.repo.softDelete(userId, id);
  }
}
