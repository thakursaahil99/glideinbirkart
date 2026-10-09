import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import { PrismaService } from '../../infra/prisma.service';
import { userSelect } from './user.mapper';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  }

  findByPhone(phone: string) {
    return this.prisma.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true } });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }
}
