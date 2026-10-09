import { Injectable } from '@nestjs/common';
import type { BreadcrumbItem, CategoryAttributeDto, CategoryDto } from '@gk/types';
import type { CategoryAttributesInput, CategoryInput, CategoryReorderInput } from '@gk/validators';
import { badRequest, notFound } from '../../common/errors';
import { uniqueSlug } from '../../common/utils/slug';
import { CacheNs, CacheService } from '../../infra/cache.service';
import { PrismaService } from '../../infra/prisma.service';
import { QueueNames, QueueService } from '../../infra/queue.service';

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  depth: number;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
};

const toDto = (c: CategoryRow, productCount?: number): CategoryDto => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  parentId: c.parentId,
  path: c.path,
  depth: c.depth,
  description: c.description,
  imageUrl: c.imageUrl,
  icon: c.icon,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
  ...(productCount !== undefined ? { productCount } : {}),
});

function buildTree(rows: CategoryRow[], counts: Map<string, number>): CategoryDto[] {
  const nodes = new Map<string, CategoryDto>();
  rows.forEach((r) => nodes.set(r.id, { ...toDto(r, counts.get(r.id) ?? 0), children: [] }));
  const roots: CategoryDto[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id) as CategoryDto;
    const parent = r.parentId ? nodes.get(r.parentId) : undefined;
    if (parent) parent.children?.push(node);
    else if (!r.parentId) roots.push(node);
  }
  const sort = (list: CategoryDto[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    list.forEach((n) => n.children && sort(n.children));
  };
  sort(roots);
  return roots;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
  ) {}

  /** Active products per category, rolled up to every ancestor. */
  private async productCounts(rows: CategoryRow[]): Promise<Map<string, number>> {
    const grouped = await this.prisma.$queryRaw<Array<{ id: string; count: number }>>`
      SELECT "categoryId" AS id, COUNT(*)::int AS count
      FROM "Product" WHERE status = 'ACTIVE' AND "deletedAt" IS NULL GROUP BY "categoryId"`;
    const direct = new Map(grouped.map((g) => [g.id, g.count]));
    const byPath = new Map(rows.map((r) => [r.path, r]));
    const totals = new Map<string, number>();
    for (const r of rows) {
      const own = direct.get(r.id) ?? 0;
      if (!own) continue;
      const parts = r.path.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const anc = byPath.get(parts.slice(0, i).join('/'));
        if (anc) totals.set(anc.id, (totals.get(anc.id) ?? 0) + own);
      }
    }
    return totals;
  }

  private activeRows(): Promise<CategoryRow[]> {
    return this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /** Public nested tree (cached). */
  tree(): Promise<CategoryDto[]> {
    return this.cache.wrapNs(CacheNs.catalog, 'category-tree', 600, async () => {
      const rows = await this.activeRows();
      return buildTree(rows, await this.productCounts(rows));
    });
  }

  /** Admin tree includes inactive nodes. */
  async adminTree(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
    });
    return buildTree(rows, await this.productCounts(rows));
  }

  async flat(): Promise<CategoryDto[]> {
    const rows = await this.activeRows();
    return rows.map((r) => toDto(r));
  }

  async bySlug(slug: string): Promise<CategoryDto & { breadcrumbs: BreadcrumbItem[] }> {
    const row = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null, isActive: true },
    });
    if (!row) throw notFound('Category');
    const tree = await this.tree();
    const find = (list: CategoryDto[]): CategoryDto | undefined => {
      for (const n of list) {
        if (n.id === row.id) return n;
        const hit = n.children && find(n.children);
        if (hit) return hit;
      }
      return undefined;
    };
    return { ...(find(tree) ?? toDto(row)), breadcrumbs: await this.breadcrumbs(row.path) };
  }

  async breadcrumbs(path: string): Promise<BreadcrumbItem[]> {
    const slugs = path.split('/');
    const rows = await this.prisma.category.findMany({
      where: { slug: { in: slugs }, deletedAt: null },
      select: { name: true, slug: true },
    });
    return slugs
      .map((s) => rows.find((r) => r.slug === s))
      .filter((r): r is BreadcrumbItem => Boolean(r));
  }

  /** All category ids in a subtree (the category itself + descendants), by path prefix. */
  async subtreeIds(categoryId: string): Promise<string[]> {
    const cat = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { path: true },
    });
    if (!cat) return [];
    const rows = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        OR: [{ path: cat.path }, { path: { startsWith: `${cat.path}/` } }],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ───────────── admin mutations ─────────────

  private async invalidate() {
    await this.cache.bump(CacheNs.catalog, CacheNs.products);
  }

  async create(input: CategoryInput): Promise<CategoryDto> {
    const parent = input.parentId
      ? await this.prisma.category.findFirst({ where: { id: input.parentId, deletedAt: null } })
      : null;
    if (input.parentId && !parent) throw badRequest('INVALID_PARENT', 'Parent category not found');
    if (parent && parent.depth >= 3)
      throw badRequest('TOO_DEEP', 'Categories can be nested at most 4 levels deep');

    const slug = await uniqueSlug(
      input.name,
      async (s) =>
        !!(await this.prisma.category.findUnique({ where: { slug: s }, select: { id: true } })),
      'category',
    );
    const siblings = await this.prisma.category.count({
      where: { parentId: input.parentId ?? null, deletedAt: null },
    });
    const row = await this.prisma.category.create({
      data: {
        name: input.name,
        slug,
        parentId: parent?.id ?? null,
        path: parent ? `${parent.path}/${slug}` : slug,
        depth: parent ? parent.depth + 1 : 0,
        description: input.description || null,
        imageUrl: input.imageUrl || null,
        icon: input.icon || null,
        sortOrder: input.sortOrder ?? siblings,
        isActive: input.isActive ?? true,
      },
    });
    await this.invalidate();
    return toDto(row);
  }

  async update(id: string, input: Partial<CategoryInput>): Promise<CategoryDto> {
    const existing = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('Category');
    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      await this.reorder({
        nodes: [{ id, parentId: input.parentId, sortOrder: input.sortOrder ?? existing.sortOrder }],
      });
    }
    const row = await this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    if (input.name !== undefined && input.name !== existing.name) {
      await this.queue.add(QueueNames.searchIndex, { scope: 'category', id });
    }
    await this.invalidate();
    return toDto(row);
  }

  /**
   * Apply a drag-and-drop result: new parent + order for any number of nodes.
   * Paths/depths for the whole forest are then recomputed and cycles rejected.
   */
  async reorder(input: CategoryReorderInput): Promise<CategoryDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const all = await tx.category.findMany({ where: { deletedAt: null } });
      const next = new Map(
        all.map((c) => [c.id, { parentId: c.parentId, sortOrder: c.sortOrder }]),
      );
      for (const n of input.nodes) {
        if (!next.has(n.id)) throw badRequest('UNKNOWN_CATEGORY', `Category ${n.id} not found`);
        if (n.parentId && !next.has(n.parentId))
          throw badRequest('INVALID_PARENT', 'Parent category not found');
        next.set(n.id, { parentId: n.parentId, sortOrder: n.sortOrder });
      }
      // recompute path/depth from roots; unreachable nodes mean a cycle
      const children = new Map<string | null, string[]>();
      for (const [id, v] of next)
        children.set(v.parentId, [...(children.get(v.parentId) ?? []), id]);
      const slugOf = new Map(all.map((c) => [c.id, c.slug]));
      const computed = new Map<string, { path: string; depth: number }>();
      const walk = (parentId: string | null, parentPath: string, depth: number) => {
        for (const id of children.get(parentId) ?? []) {
          const path = parentPath ? `${parentPath}/${slugOf.get(id)}` : (slugOf.get(id) as string);
          computed.set(id, { path, depth });
          walk(id, path, depth + 1);
        }
      };
      walk(null, '', 0);
      if (computed.size !== all.length)
        throw badRequest('CATEGORY_CYCLE', 'That move would create a loop in the category tree');
      if ([...computed.values()].some((c) => c.depth > 3))
        throw badRequest('TOO_DEEP', 'Categories can be nested at most 4 levels deep');

      for (const c of all) {
        const v = next.get(c.id) as { parentId: string | null; sortOrder: number };
        const p = computed.get(c.id) as { path: string; depth: number };
        if (
          v.parentId !== c.parentId ||
          v.sortOrder !== c.sortOrder ||
          p.path !== c.path ||
          p.depth !== c.depth
        ) {
          await tx.category.update({
            where: { id: c.id },
            data: { parentId: v.parentId, sortOrder: v.sortOrder, path: p.path, depth: p.depth },
          });
        }
      }
    });
    await this.invalidate();
    return this.adminTree();
  }

  async remove(id: string): Promise<void> {
    const [children, products] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    ]);
    if (children > 0) throw badRequest('HAS_CHILDREN', 'Move or delete the sub-categories first');
    if (products > 0)
      throw badRequest('HAS_PRODUCTS', 'This category still has products. Move them first.');
    const res = await this.prisma.category.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (res.count === 0) throw notFound('Category');
    await this.invalidate();
  }

  // ───────────── category attributes ─────────────

  /** Attributes configured on the category and on all its ancestors (nearest wins). */
  async attributesFor(categoryId: string): Promise<CategoryAttributeDto[]> {
    const cat = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { path: true },
    });
    if (!cat) throw notFound('Category');
    const slugs = cat.path.split('/');
    const chain = await this.prisma.category.findMany({
      where: { slug: { in: slugs }, deletedAt: null },
      select: { id: true, depth: true },
    });
    const orderedIds = chain.sort((a, b) => a.depth - b.depth).map((c) => c.id);
    const links = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: orderedIds } },
      include: {
        attribute: { include: { values: { orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }] } } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    const merged = new Map<string, (typeof links)[number]>();
    for (const id of orderedIds)
      for (const l of links.filter((x) => x.categoryId === id)) merged.set(l.attributeId, l);
    return [...merged.values()].map((l) => ({
      id: l.attribute.id,
      name: l.attribute.name,
      slug: l.attribute.slug,
      type: l.attribute.type,
      unit: l.attribute.unit,
      isFilterable: l.attribute.isFilterable,
      isRequired: l.isRequired,
      isVariantAxis: l.isVariantAxis,
      values: l.attribute.values.map((v) => ({ id: v.id, value: v.value, hex: v.hex })),
    }));
  }

  async setAttributes(
    categoryId: string,
    input: CategoryAttributesInput,
  ): Promise<CategoryAttributeDto[]> {
    const exists = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw notFound('Category');
    await this.prisma.$transaction([
      this.prisma.categoryAttribute.deleteMany({ where: { categoryId } }),
      this.prisma.categoryAttribute.createMany({
        data: input.attributes.map((a, i) => ({
          categoryId,
          attributeId: a.attributeId,
          isRequired: a.isRequired,
          isVariantAxis: a.isVariantAxis,
          sortOrder: i,
        })),
      }),
    ]);
    await this.invalidate();
    return this.attributesFor(categoryId);
  }
}
