import { Injectable } from '@nestjs/common';
import type { PincodeCheck, ServiceablePincodeDto } from '@gk/types';
import type { ServiceablePincodeInput } from '@gk/validators';
import { Prisma } from '@gk/db';
import { conflict, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';

const DEFAULT_DELIVERY_DAYS = 5;

const toDto = (p: {
  id: string;
  pincode: string;
  city: string;
  state: string;
  deliveryDays: number;
  codAvailable: boolean;
  isActive: boolean;
}): ServiceablePincodeDto => ({
  id: p.id,
  pincode: p.pincode,
  city: p.city,
  state: p.state,
  deliveryDays: p.deliveryDays,
  codAvailable: p.codAvailable,
  isActive: p.isActive,
});

/** Estimated delivery date skipping Sundays. */
export function etaFrom(days: number, from = new Date()): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) remaining -= 1;
  }
  return d;
}

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * If admins have configured any serviceable PIN codes, only those are deliverable.
   * With an empty list (fresh install) every valid PIN is treated as serviceable.
   */
  async check(pincode: string): Promise<PincodeCheck> {
    const configured = await this.prisma.serviceablePincode.count({ where: { isActive: true } });
    if (configured === 0) {
      return {
        pincode,
        serviceable: true,
        deliveryDays: DEFAULT_DELIVERY_DAYS,
        eta: etaFrom(DEFAULT_DELIVERY_DAYS).toISOString(),
        codAvailable: true,
        message: `Delivery by ${etaFrom(DEFAULT_DELIVERY_DAYS).toDateString()}`,
      };
    }
    const row = await this.prisma.serviceablePincode.findUnique({ where: { pincode } });
    if (!row || !row.isActive) {
      return {
        pincode,
        serviceable: false,
        message: 'Sorry, we do not deliver to this PIN code yet.',
      };
    }
    const eta = etaFrom(row.deliveryDays);
    return {
      pincode,
      serviceable: true,
      city: row.city,
      state: row.state,
      deliveryDays: row.deliveryDays,
      eta: eta.toISOString(),
      codAvailable: row.codAvailable,
      message: `Delivery to ${row.city} by ${eta.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`,
    };
  }

  // ───────────── admin ─────────────

  async list(page: number, limit: number, q?: string): Promise<PagedResult<ServiceablePincodeDto>> {
    const where: Prisma.ServiceablePincodeWhereInput = q
      ? { OR: [{ pincode: { startsWith: q } }, { city: { contains: q, mode: 'insensitive' } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.serviceablePincode.findMany({
        where,
        orderBy: { pincode: 'asc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.serviceablePincode.count({ where }),
    ]);
    return paged(rows.map(toDto), page, limit, total);
  }

  async upsert(input: ServiceablePincodeInput & { id?: string }): Promise<ServiceablePincodeDto> {
    const data = {
      pincode: input.pincode,
      city: input.city,
      state: input.state,
      deliveryDays: input.deliveryDays,
      codAvailable: input.codAvailable ?? true,
      isActive: input.isActive ?? true,
    };
    try {
      const row = input.id
        ? await this.prisma.serviceablePincode.update({ where: { id: input.id }, data })
        : await this.prisma.serviceablePincode.create({ data });
      return toDto(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002')
          throw conflict('PINCODE_EXISTS', 'This PIN code is already configured');
        if (err.code === 'P2025') throw notFound('PIN code');
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.prisma.serviceablePincode.delete({ where: { id } }).catch(() => {
      throw notFound('PIN code');
    });
  }
}
