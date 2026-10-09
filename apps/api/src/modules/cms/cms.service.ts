import { Injectable } from '@nestjs/common';
import type { CmsPageDto } from '@gk/types';
import type { CmsPageInput } from '@gk/validators';
import { Prisma } from '@gk/db';
import { conflict, notFound } from '../../common/errors';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';

const toDto = (p: {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  updatedAt: Date;
}): CmsPageDto => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  content: p.content,
  isPublished: p.isPublished,
  updatedAt: p.updatedAt.toISOString(),
});

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Public listing for footer links (title + slug only). */
  listPublished(): Promise<Array<{ slug: string; title: string }>> {
    return this.cache.wrapNs(CacheNs.cms, 'list', 600, () =>
      this.prisma.cmsPage.findMany({
        where: { isPublished: true },
        select: { slug: true, title: true },
        orderBy: { title: 'asc' },
      }),
    );
  }

  getPublished(slug: string): Promise<CmsPageDto> {
    return this.cache.wrapNs(CacheNs.cms, `page:${slug}`, 600, async () => {
      const page = await this.prisma.cmsPage.findFirst({ where: { slug, isPublished: true } });
      if (!page) throw notFound('Page');
      return toDto(page);
    });
  }

  async adminList(): Promise<CmsPageDto[]> {
    return (await this.prisma.cmsPage.findMany({ orderBy: { title: 'asc' } })).map(toDto);
  }

  async create(input: CmsPageInput): Promise<CmsPageDto> {
    try {
      const page = await this.prisma.cmsPage.create({
        data: {
          slug: input.slug,
          title: input.title,
          content: input.content,
          isPublished: input.isPublished ?? true,
        },
      });
      await this.cache.bump(CacheNs.cms);
      return toDto(page);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw conflict('SLUG_EXISTS', 'A page with this slug already exists');
      throw err;
    }
  }

  async update(id: string, input: Partial<CmsPageInput>): Promise<CmsPageDto> {
    const existing = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!existing) throw notFound('Page');
    const page = await this.prisma.cmsPage.update({
      where: { id },
      data: {
        title: input.title,
        content: input.content,
        isPublished: input.isPublished,
        slug: input.slug,
      },
    });
    await this.cache.bump(CacheNs.cms);
    return toDto(page);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.cmsPage.delete({ where: { id } }).catch(() => {
      throw notFound('Page');
    });
    await this.cache.bump(CacheNs.cms);
  }
}
