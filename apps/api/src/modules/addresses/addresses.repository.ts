import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class AddressesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  find(userId: string, id: string) {
    return this.prisma.address.findFirst({ where: { id, userId, deletedAt: null } });
  }

  count(userId: string) {
    return this.prisma.address.count({ where: { userId, deletedAt: null } });
  }

  async create(userId: string, data: Omit<Prisma.AddressUncheckedCreateInput, 'userId'>) {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      return tx.address.create({ data: { ...data, userId } });
    });
  }

  async update(userId: string, id: string, data: Prisma.AddressUncheckedUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({ where: { id }, data });
    });
  }

  async softDelete(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.address.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      });
      if (removed.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}
