import { Injectable } from '@nestjs/common';
import type { BrandDto } from '@gk/types';
import type { BrandInput } from '@gk/validators';
import { badRequest, notFound } from '../../common/errors';
import { uniqueSlug } from '../../common/utils/slug';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';
import { QueueNames, QueueService } from '../../infra/queue.service';

const toDto = (
  b: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    description: string | null;
    isActive: boolean;
  },
  productCount?: number,
): BrandDto => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
  logoUrl: b.logoUrl,
  description: b.description,
  isActive: b.isActive,
  ...(productCount !== undefined ? { productCount } : {}),
});

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
  ) {}

  list(): Promise<BrandDto[]> {
    return this.cache.wrapNs(CacheNs.catalog, 'brands', 600, async () => {
      const [brands, counts] = await Promise.all([
        this.prisma.brand.findMany({
          where: { deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.product.groupBy({
          by: ['brandId'],
          where: { status: 'ACTIVE', deletedAt: null, brandId: { not: null } },
          _count: true,
        }),
      ]);
      const countMap = new Map(counts.map((c) => [c.brandId, c._count]));
      return brands.map((b) => toDto(b, countMap.get(b.id) ?? 0));
    });
  }

  async adminList(): Promise<BrandDto[]> {
    const brands = await this.prisma.brand.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return brands.map((b) => toDto(b));
  }

  async create(input: BrandInput): Promise<BrandDto> {
    const slug = await uniqueSlug(
      input.name,
      async (s) =>
        !!(await this.prisma.brand.findUnique({ where: { slug: s }, select: { id: true } })),
      'brand',
    );
    const row = await this.prisma.brand.create({
      data: {
        name: input.name,
        slug,
        logoUrl: input.logoUrl || null,
        description: input.description || null,
        isActive: input.isActive ?? true,
      },
    });
    await this.cache.bump(CacheNs.catalog);
    return toDto(row);
  }

  async update(id: string, input: Partial<BrandInput>): Promise<BrandDto> {
    const existing = await this.prisma.brand.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Brand');
    const row = await this.prisma.brand.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    if (input.name && input.name !== existing.name)
      await this.queue.add(QueueNames.searchIndex, { scope: 'brand', id });
    await this.cache.bump(CacheNs.catalog, CacheNs.products);
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    const products = await this.prisma.product.count({ where: { brandId: id, deletedAt: null } });
    if (products > 0)
      throw badRequest('HAS_PRODUCTS', 'This brand is used by products. Deactivate it instead.');
    const res = await this.prisma.brand.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (res.count === 0) throw notFound('Brand');
    await this.cache.bump(CacheNs.catalog);
  }
}
