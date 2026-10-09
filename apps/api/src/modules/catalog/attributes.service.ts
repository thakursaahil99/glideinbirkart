import { Injectable } from '@nestjs/common';
import type { AttributeDto } from '@gk/types';
import type { AttributeInput } from '@gk/validators';
import { badRequest, notFound } from '../../common/errors';
import { uniqueSlug } from '../../common/utils/slug';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';

const include = { values: { orderBy: [{ sortOrder: 'asc' as const }, { value: 'asc' as const }] } };

type AttrRow = Awaited<ReturnType<AttributesService['load']>>;

const toDto = (a: NonNullable<AttrRow>): AttributeDto => ({
  id: a.id,
  name: a.name,
  slug: a.slug,
  type: a.type,
  unit: a.unit,
  isFilterable: a.isFilterable,
  values: a.values.map((v) => ({ id: v.id, value: v.value, hex: v.hex })),
});

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private load(id: string) {
    return this.prisma.attribute.findUnique({ where: { id }, include });
  }

  async list(): Promise<AttributeDto[]> {
    const rows = await this.prisma.attribute.findMany({ include, orderBy: { name: 'asc' } });
    return rows.map(toDto);
  }

  async create(input: AttributeInput): Promise<AttributeDto> {
    const slug = await uniqueSlug(
      input.name,
      async (s) =>
        !!(await this.prisma.attribute.findUnique({ where: { slug: s }, select: { id: true } })),
      'attribute',
    );
    const row = await this.prisma.attribute.create({
      data: {
        name: input.name,
        slug,
        type: input.type,
        unit: input.unit || null,
        isFilterable: input.isFilterable ?? true,
        values: {
          create: (input.values ?? []).map((v, i) => ({
            value: v.value,
            hex: v.hex || null,
            sortOrder: i,
          })),
        },
      },
      include,
    });
    await this.cache.bump(CacheNs.catalog);
    return toDto(row);
  }

  async update(id: string, input: Partial<AttributeInput>): Promise<AttributeDto> {
    const existing = await this.load(id);
    if (!existing) throw notFound('Attribute');
    await this.prisma.$transaction(async (tx) => {
      await tx.attribute.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.unit !== undefined ? { unit: input.unit || null } : {}),
          ...(input.isFilterable !== undefined ? { isFilterable: input.isFilterable } : {}),
        },
      });
      if (input.values) {
        await tx.attributeValue.deleteMany({ where: { attributeId: id } });
        await tx.attributeValue.createMany({
          data: input.values.map((v, i) => ({
            attributeId: id,
            value: v.value,
            hex: v.hex || null,
            sortOrder: i,
          })),
          skipDuplicates: true,
        });
      }
    });
    await this.cache.bump(CacheNs.catalog);
    return toDto((await this.load(id)) as NonNullable<AttrRow>);
  }

  async remove(id: string): Promise<void> {
    const used = await this.prisma.categoryAttribute.count({ where: { attributeId: id } });
    if (used > 0) throw badRequest('IN_USE', 'Remove this attribute from its categories first');
    await this.prisma.attribute.delete({ where: { id } }).catch(() => {
      throw notFound('Attribute');
    });
    await this.cache.bump(CacheNs.catalog);
  }
}
