import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { InventoryRow, ProductStatus, SellerProductDto, SellerProductRow } from '@gk/types';
import type { InventoryUpdateInput, ProductOutput, SellerProductQuery } from '@gk/validators';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { uniqueSlug } from '../../common/utils/slug';
import { orderByFrom } from '../../common/utils/sort';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { CategoriesService } from '../catalog/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { ProductAggregatesService } from './product-aggregates.service';
import { available, num, toImageDto } from './products.mapper';

type Variant = ProductOutput['variants'][number];

const fullInclude = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
  images: { orderBy: { position: 'asc' as const } },
  variants: {
    where: { deletedAt: null },
    orderBy: { position: 'asc' as const },
    include: { inventory: true },
  },
} satisfies Prisma.ProductInclude;

type FullRow = Prisma.ProductGetPayload<{ include: typeof fullInclude }>;

const variantKey = (attrs: Record<string, string>) =>
  Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v.toLowerCase()}`)
    .join('|');

@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly categories: CategoriesService,
    private readonly aggregates: ProductAggregatesService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────── mapping ─────────────

  private toDto(p: FullRow): SellerProductDto {
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      rejectionReason: p.rejectionReason,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      brandId: p.brandId,
      brandName: p.brand?.name ?? null,
      description: p.description,
      highlights: p.highlights,
      specifications: (p.specifications as Array<{ key: string; value: string }>) ?? [],
      attributes: (p.attributes as Record<string, string>) ?? {},
      tags: p.tags,
      gstRate: num(p.gstRate),
      hsnCode: p.hsnCode,
      isReturnable: p.isReturnable,
      returnWindowDays: p.returnWindowDays,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      images: p.images.map(toImageDto),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        attributes: v.attributes as Record<string, string>,
        mrp: num(v.mrp),
        price: num(v.price),
        stock: v.inventory?.quantity ?? 0,
        reserved: v.inventory?.reserved ?? 0,
        lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
        weightGrams: v.weightGrams,
        isActive: v.isActive,
        isDefault: v.isDefault,
      })),
      minPrice: num(p.minPrice),
      totalStock: p.totalStock,
      ratingAvg: num(p.ratingAvg),
      ratingCount: p.ratingCount,
      soldCount: p.soldCount,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private async loadOwned(sellerId: string, id: string): Promise<FullRow> {
    const p = await this.prisma.product.findFirst({
      where: { id, sellerId, deletedAt: null },
      include: fullInclude,
    });
    if (!p) throw notFound('Product');
    return p;
  }

  // ───────────── reads ─────────────

  async list(sellerId: string, q: SellerProductQuery): Promise<PagedResult<SellerProductRow>> {
    const where: Prisma.ProductWhereInput = {
      sellerId,
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const dir = q.order;
    const legacy: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      newest: { createdAt: 'desc' },
      oldest: { createdAt: 'asc' },
      stock: { totalStock: 'asc' },
      sold: { soldCount: 'desc' },
    };
    const orderBy =
      (q.sort && legacy[q.sort]) ||
      (orderByFrom(
        q.sort,
        dir,
        {
          createdAt: 'createdAt',
          name: 'name',
          totalStock: 'totalStock',
          soldCount: 'soldCount',
          minPrice: 'minPrice',
        },
        { createdAt: 'desc' as const },
      ) as Prisma.ProductOrderByWithRelationInput);
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        include: {
          category: { select: { name: true } },
          images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          _count: { select: { variants: { where: { deletedAt: null } } } },
        },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paged(
      rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        image: p.images[0]?.url ?? null,
        status: p.status,
        rejectionReason: p.rejectionReason,
        categoryName: p.category.name,
        minPrice: num(p.minPrice),
        totalStock: p.totalStock,
        variantCount: p._count.variants,
        soldCount: p.soldCount,
        createdAt: p.createdAt.toISOString(),
      })),
      q.page,
      q.limit,
      total,
    );
  }

  async get(sellerId: string, id: string): Promise<SellerProductDto> {
    return this.toDto(await this.loadOwned(sellerId, id));
  }

  // ───────────── validation ─────────────

  /** Validates dynamic attributes and variant uniqueness against the category's attribute rules. */
  private async validate(input: ProductOutput, existingProductId?: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, deletedAt: null, isActive: true },
      select: { id: true, children: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!category) throw badRequest('INVALID_CATEGORY', 'Choose a valid category');
    if (category.children.length > 0)
      throw badRequest(
        'NOT_LEAF_CATEGORY',
        'Choose the most specific (leaf) category for your product',
      );
    if (input.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: input.brandId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (!brand) throw badRequest('INVALID_BRAND', 'Choose a valid brand');
    }

    const attrs = await this.categories.attributesFor(input.categoryId);
    const issues: Array<{ path: string; message: string }> = [];
    for (const a of attrs) {
      const allowed = a.values.map((v) => v.value);
      const check = (value: string | undefined, path: string) => {
        if (value === undefined || value === '') {
          if (a.isRequired) issues.push({ path, message: `${a.name} is required` });
          return;
        }
        if (
          (a.type === 'SELECT' || a.type === 'COLOR') &&
          allowed.length &&
          !allowed.includes(value)
        ) {
          issues.push({ path, message: `${a.name}: "${value}" is not an allowed value` });
        }
        if (a.type === 'NUMBER' && Number.isNaN(Number(value)))
          issues.push({ path, message: `${a.name} must be a number` });
      };
      if (a.isVariantAxis)
        input.variants.forEach((v, i) =>
          check(v.attributes[a.slug], `variants.${i}.attributes.${a.slug}`),
        );
      else check(input.attributes[a.slug], `attributes.${a.slug}`);
    }
    if (issues.length)
      throw badRequest('INVALID_ATTRIBUTES', issues[0]?.message ?? 'Invalid attributes', issues);

    const skus = input.variants.map((v) => v.sku.toUpperCase());
    if (new Set(skus).size !== skus.length)
      throw badRequest('DUPLICATE_SKU', 'SKUs must be unique within a product');
    const keys = input.variants.map((v) => variantKey(v.attributes));
    if (input.variants.length > 1 && new Set(keys).size !== keys.length)
      throw badRequest('DUPLICATE_VARIANT', 'Two variants have the same option combination');

    const clash = await this.prisma.productVariant.findFirst({
      where: {
        sku: { in: input.variants.map((v) => v.sku) },
        ...(existingProductId ? { productId: { not: existingProductId } } : {}),
      },
      select: { sku: true },
    });
    if (clash) throw conflict('SKU_EXISTS', `SKU ${clash.sku} is already used by another product`);
  }

  // ───────────── writes ─────────────

  private variantData(v: Variant, position: number) {
    return {
      sku: v.sku,
      name: v.name || Object.values(v.attributes).join(' / ') || 'Default',
      attributes: v.attributes as Prisma.InputJsonValue,
      mrp: v.mrp,
      price: v.price,
      weightGrams: v.weightGrams ?? null,
      isActive: v.isActive ?? true,
      isDefault: position === 0,
      position,
    };
  }

  private async afterWrite(productId: string, notifyAdmins: boolean, name: string) {
    await Promise.all([
      this.aggregates.invalidateDetail([productId]),
      this.aggregates.bumpListings(),
    ]);
    if (notifyAdmins) {
      await this.notifications.notifyAdmins({
        type: 'PRODUCT',
        title: 'Product awaiting moderation',
        body: `"${name}" was submitted for review.`,
        data: { productId, link: '/admin/products' },
      });
    }
  }

  async create(sellerId: string, input: ProductOutput): Promise<SellerProductDto> {
    await this.validate(input);
    const slug = await uniqueSlug(
      input.name,
      async (s) =>
        !!(await this.prisma.product.findUnique({ where: { slug: s }, select: { id: true } })),
      'product',
    );
    const settings = await this.settings.get();

    const productId = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sellerId,
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          name: input.name,
          slug,
          description: input.description,
          highlights: input.highlights,
          specifications: input.specifications as Prisma.InputJsonValue,
          attributes: input.attributes as Prisma.InputJsonValue,
          tags: input.tags,
          gstRate: input.gstRate,
          hsnCode: input.hsnCode || null,
          isReturnable: input.isReturnable,
          returnWindowDays: input.isReturnable ? input.returnWindowDays : 0,
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          status: input.submit ? 'PENDING_REVIEW' : 'DRAFT',
        },
      });
      const skuToId = new Map<string, string>();
      for (const [i, v] of input.variants.entries()) {
        const created = await tx.productVariant.create({
          data: {
            ...this.variantData(v, i),
            productId: product.id,
            inventory: {
              create: {
                quantity: v.stock,
                lowStockThreshold: v.lowStockThreshold ?? settings.lowStockThreshold,
              },
            },
          },
        });
        skuToId.set(v.sku, created.id);
      }
      await tx.productImage.createMany({
        data: input.images.map((img, i) => ({
          productId: product.id,
          url: img.url,
          alt: img.alt || input.name,
          publicId: img.publicId,
          position: i,
          variantId: img.variantSku ? (skuToId.get(img.variantSku) ?? null) : null,
        })),
      });
      await this.aggregates.recomputePricing(product.id, tx);
      await this.aggregates.recomputeStock([product.id], tx);
      return product.id;
    });

    await this.afterWrite(productId, input.submit, input.name);
    return this.get(sellerId, productId);
  }

  async update(sellerId: string, id: string, input: ProductOutput): Promise<SellerProductDto> {
    const current = await this.loadOwned(sellerId, id);
    if (current.status === 'PENDING_REVIEW')
      throw badRequest(
        'UNDER_REVIEW',
        'This product is awaiting moderation. Wait for a decision before editing.',
      );
    await this.validate(input, id);
    const settings = await this.settings.get();

    const contentChanged =
      current.name !== input.name ||
      current.description !== input.description ||
      current.categoryId !== input.categoryId ||
      (current.brandId ?? null) !== (input.brandId ?? null) ||
      JSON.stringify(current.images.map((i) => i.url)) !==
        JSON.stringify(input.images.map((i) => i.url));

    let status: ProductStatus = current.status;
    if (current.status === 'ACTIVE' && contentChanged)
      status = 'PENDING_REVIEW'; // listing content is re-moderated; price/stock edits stay live
    else if (current.status === 'REJECTED' || current.status === 'DRAFT')
      status = input.submit ? 'PENDING_REVIEW' : 'DRAFT';

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          name: input.name,
          description: input.description,
          highlights: input.highlights,
          specifications: input.specifications as Prisma.InputJsonValue,
          attributes: input.attributes as Prisma.InputJsonValue,
          tags: input.tags,
          gstRate: input.gstRate,
          hsnCode: input.hsnCode || null,
          isReturnable: input.isReturnable,
          returnWindowDays: input.isReturnable ? input.returnWindowDays : 0,
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          status,
          rejectionReason: status === 'PENDING_REVIEW' ? null : current.rejectionReason,
        },
      });

      // match incoming variants to existing ones by id, then by SKU
      const existingById = new Map(current.variants.map((v) => [v.id, v]));
      const existingBySku = new Map(current.variants.map((v) => [v.sku, v]));
      const kept = new Set<string>();
      const skuToId = new Map<string, string>();
      for (const [i, v] of input.variants.entries()) {
        const match = (v.id && existingById.get(v.id)) || existingBySku.get(v.sku);
        if (match) {
          kept.add(match.id);
          await tx.productVariant.update({ where: { id: match.id }, data: this.variantData(v, i) });
          const inv = match.inventory;
          const quantity = Math.max(v.stock, inv?.reserved ?? 0); // can't drop below what's already reserved
          await tx.inventory.upsert({
            where: { variantId: match.id },
            create: {
              variantId: match.id,
              quantity: v.stock,
              lowStockThreshold: v.lowStockThreshold ?? settings.lowStockThreshold,
            },
            update: {
              quantity,
              ...(v.lowStockThreshold !== undefined
                ? { lowStockThreshold: v.lowStockThreshold }
                : {}),
            },
          });
          skuToId.set(v.sku, match.id);
        } else {
          const created = await tx.productVariant.create({
            data: {
              ...this.variantData(v, i),
              productId: id,
              inventory: {
                create: {
                  quantity: v.stock,
                  lowStockThreshold: v.lowStockThreshold ?? settings.lowStockThreshold,
                },
              },
            },
          });
          kept.add(created.id);
          skuToId.set(v.sku, created.id);
        }
      }
      // variants that disappeared are retired (soft delete keeps order history intact)
      const removed = current.variants.filter((v) => !kept.has(v.id));
      if (removed.length) {
        await tx.productVariant.updateMany({
          where: { id: { in: removed.map((v) => v.id) } },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.cartItem.deleteMany({ where: { variantId: { in: removed.map((v) => v.id) } } });
      }

      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.createMany({
        data: input.images.map((img, i) => ({
          productId: id,
          url: img.url,
          alt: img.alt || input.name,
          publicId: img.publicId,
          position: i,
          variantId: img.variantSku ? (skuToId.get(img.variantSku) ?? null) : null,
        })),
      });
      await this.aggregates.recomputePricing(id, tx);
      await this.aggregates.recomputeStock([id], tx);
    });

    await this.afterWrite(id, status === 'PENDING_REVIEW', input.name);
    return this.get(sellerId, id);
  }

  async setStatus(
    sellerId: string,
    id: string,
    action: 'ARCHIVE' | 'UNARCHIVE' | 'SUBMIT',
  ): Promise<SellerProductDto> {
    const p = await this.loadOwned(sellerId, id);
    let status: ProductStatus = p.status;
    if (action === 'ARCHIVE') {
      if (p.status === 'PENDING_REVIEW')
        throw badRequest('UNDER_REVIEW', 'Cannot archive while under review');
      status = 'ARCHIVED';
    } else if (action === 'UNARCHIVE') {
      if (p.status !== 'ARCHIVED') throw badRequest('INVALID_STATE', 'Product is not archived');
      status = 'DRAFT';
    } else {
      if (!['DRAFT', 'REJECTED'].includes(p.status))
        throw badRequest('INVALID_STATE', 'Only drafts or rejected products can be submitted');
      status = 'PENDING_REVIEW';
    }
    await this.prisma.product.update({
      where: { id },
      data: { status, ...(status === 'PENDING_REVIEW' ? { rejectionReason: null } : {}) },
    });
    await this.afterWrite(id, status === 'PENDING_REVIEW', p.name);
    return this.get(sellerId, id);
  }

  async remove(sellerId: string, id: string): Promise<void> {
    const p = await this.loadOwned(sellerId, id);
    const orders = await this.prisma.orderItem.count({ where: { productId: id } });
    if (orders > 0)
      throw badRequest('HAS_ORDERS', 'This product has orders. Archive it instead of deleting.');
    if (p.status === 'ACTIVE')
      throw badRequest('IS_LIVE', 'Archive a live product before deleting it');
    await this.prisma.$transaction([
      this.prisma.cartItem.deleteMany({ where: { variant: { productId: id } } }),
      this.prisma.product.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      }),
    ]);
    await this.afterWrite(id, false, p.name);
  }

  // ───────────── inventory ─────────────

  async inventory(
    sellerId: string,
    page: number,
    limit: number,
    lowOnly: boolean,
    q?: string,
  ): Promise<PagedResult<InventoryRow>> {
    const where: Prisma.ProductVariantWhereInput = {
      deletedAt: null,
      isActive: true,
      product: { sellerId, deletedAt: null, status: { not: 'ARCHIVED' } },
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: 'insensitive' } },
              { product: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.productVariant.findMany({
      where,
      include: {
        inventory: true,
        product: {
          select: {
            id: true,
            name: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
    });
    // "low" depends on a per-row threshold, so filter in memory (inventories are modest per seller)
    const mapped: InventoryRow[] = rows.map((v) => {
      const inv = v.inventory;
      const avail = available(inv);
      return {
        variantId: v.id,
        sku: v.sku,
        productId: v.product.id,
        productName: v.product.name,
        variantName: v.name,
        image: v.product.images[0]?.url ?? null,
        quantity: inv?.quantity ?? 0,
        reserved: inv?.reserved ?? 0,
        available: avail,
        lowStockThreshold: inv?.lowStockThreshold ?? 5,
        isLow: avail <= (inv?.lowStockThreshold ?? 5),
      };
    });
    const filtered = lowOnly ? mapped.filter((r) => r.isLow) : mapped;
    const start = (page - 1) * limit;
    return paged(filtered.slice(start, start + limit), page, limit, filtered.length, {
      lowStockCount: mapped.filter((r) => r.isLow).length,
    });
  }

  async updateInventory(
    sellerId: string,
    variantId: string,
    input: InventoryUpdateInput,
  ): Promise<InventoryRow> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, deletedAt: null, product: { sellerId, deletedAt: null } },
      include: {
        inventory: true,
        product: { select: { id: true, name: true, images: { take: 1, select: { url: true } } } },
      },
    });
    if (!variant) throw notFound('Variant');
    const reserved = variant.inventory?.reserved ?? 0;
    if (input.quantity < reserved)
      throw badRequest(
        'BELOW_RESERVED',
        `${reserved} units are reserved for pending orders; stock can't go below that`,
      );
    const inv = await this.prisma.inventory.upsert({
      where: { variantId },
      create: {
        variantId,
        quantity: input.quantity,
        lowStockThreshold: input.lowStockThreshold ?? 5,
      },
      update: {
        quantity: input.quantity,
        ...(input.lowStockThreshold !== undefined
          ? { lowStockThreshold: input.lowStockThreshold }
          : {}),
      },
    });
    await this.aggregates.recomputeStock([variant.product.id]);
    await this.aggregates.invalidateDetail([variant.product.id]);
    const avail = available(inv);
    return {
      variantId,
      sku: variant.sku,
      productId: variant.product.id,
      productName: variant.product.name,
      variantName: variant.name,
      image: variant.product.images[0]?.url ?? null,
      quantity: inv.quantity,
      reserved: inv.reserved,
      available: avail,
      lowStockThreshold: inv.lowStockThreshold,
      isLow: avail <= inv.lowStockThreshold,
    };
  }

  /**
   * Notify the seller (at most once a day per variant) when sales push available stock to the low-stock threshold.
   * Called by checkout after stock is committed.
   */
  async checkLowStock(variantIds: string[]): Promise<void> {
    if (variantIds.length === 0) return;
    const rows = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        inventory: true,
        product: { select: { id: true, name: true, seller: { select: { userId: true } } } },
      },
    });
    for (const v of rows) {
      const avail = available(v.inventory);
      if (!v.inventory || avail > v.inventory.lowStockThreshold) continue;
      const first = await this.redis.client
        .set(`gk:lowstock:${v.id}`, '1', 'EX', 24 * 3600, 'NX')
        .catch(() => 'OK');
      if (!first) continue;
      await this.notifications.notify(v.product.seller.userId, {
        type: 'PRODUCT',
        title: avail === 0 ? 'Out of stock' : 'Low stock alert',
        body: `${v.product.name} (${v.sku}) has ${avail} unit${avail === 1 ? '' : 's'} left.`,
        data: { link: '/seller/inventory', variantId: v.id },
      });
    }
  }

  assertApproved(status: string) {
    if (status !== 'APPROVED') throw forbidden('Your seller account is not approved yet');
  }
}
