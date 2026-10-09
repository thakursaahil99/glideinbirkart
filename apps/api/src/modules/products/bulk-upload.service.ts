import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type { BulkUploadReport } from '@gk/types';
import { productInputSchema, type ProductInput } from '@gk/validators';
import { AppException, badRequest } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { CategoriesService } from '../catalog/categories.service';
import { ProductAggregatesService } from './product-aggregates.service';
import { SellerProductsService } from './seller-products.service';

const MAX_ROWS = 500;
const BASE_COLUMNS = [
  'group',
  'name',
  'category',
  'brand',
  'description',
  'highlights',
  'specifications',
  'images',
  'gst_rate',
  'hsn',
  'variant_name',
  'sku',
  'mrp',
  'price',
  'stock',
];

type Row = Record<string, string>;

export const csvTemplate = () =>
  [
    [...BASE_COLUMNS, 'attr_color', 'attr_size'].join(','),
    [
      'TSHIRT-01',
      'Cotton Crew Neck T-Shirt',
      'mens-tshirts',
      'Urban Weave',
      '"Soft 100% cotton t-shirt with a relaxed fit, perfect for everyday wear."',
      'Breathable cotton|Machine washable|Regular fit',
      'Material:Cotton|Fit:Regular',
      'https://example.com/tshirt-front.jpg|https://example.com/tshirt-back.jpg',
      '5',
      '6109',
      'Black / M',
      'TSH-BLK-M',
      '999',
      '599',
      '40',
      'Black',
      'M',
    ].join(','),
    [
      'TSHIRT-01',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Black / L',
      'TSH-BLK-L',
      '999',
      '599',
      '25',
      'Black',
      'L',
    ].join(','),
  ].join('\n') + '\n';

@Injectable()
export class BulkUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly products: SellerProductsService,
    private readonly aggregates: ProductAggregatesService,
  ) {}

  async process(sellerId: string, buffer: Buffer): Promise<BulkUploadReport> {
    let rows: Row[];
    try {
      rows = parse(buffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }) as Row[];
    } catch (err) {
      throw badRequest('INVALID_CSV', `Could not read the CSV file: ${(err as Error).message}`);
    }
    if (rows.length === 0) throw badRequest('EMPTY_CSV', 'The file has no data rows');
    if (rows.length > MAX_ROWS)
      throw badRequest('TOO_MANY_ROWS', `Upload at most ${MAX_ROWS} rows at a time`);
    for (const required of ['sku', 'price', 'mrp', 'stock']) {
      if (!(required in (rows[0] as Row)))
        throw badRequest('MISSING_COLUMN', `Missing required column "${required}"`);
    }

    const report: BulkUploadReport = {
      total: rows.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };
    const failedRows = new Set<number>();
    const fail = (row: number, message: string, sku?: string) => {
      report.errors.push({ row, sku, message });
      failedRows.add(row);
    };

    // group rows into products
    const groups = new Map<string, Array<{ row: number; data: Row }>>();
    rows.forEach((data, idx) => {
      const rowNo = idx + 2; // header is row 1
      const key = data['group'] || data['sku'] || `row-${rowNo}`;
      groups.set(key, [...(groups.get(key) ?? []), { row: rowNo, data }]);
    });

    const [allCategories, allBrands] = await Promise.all([
      this.prisma.category.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, slug: true },
      }),
      this.prisma.brand.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
      }),
    ]);
    const categoryBySlug = new Map(allCategories.map((c) => [c.slug, c.id]));
    const brandByName = new Map(allBrands.map((b) => [b.name.toLowerCase(), b.id]));

    for (const [groupKey, members] of groups) {
      const first = members[0] as (typeof members)[number];
      const skus = members.map((m) => m.data['sku'] ?? '').filter(Boolean);

      // ── update mode: SKUs that already belong to this seller → refresh price / stock ──
      const existing = skus.length
        ? await this.prisma.productVariant.findMany({
            where: { sku: { in: skus }, deletedAt: null, product: { sellerId } },
            include: { inventory: true },
          })
        : [];
      if (existing.length > 0) {
        if (existing.length !== skus.length) {
          fail(
            first.row,
            `Group "${groupKey}" mixes existing and new SKUs; upload new variants through the product editor`,
            skus[0],
          );
          continue;
        }
        const touched = new Set<string>();
        for (const m of members) {
          const variant = existing.find((v) => v.sku === m.data['sku']);
          if (!variant) continue;
          const mrp = Number(m.data['mrp']);
          const price = Number(m.data['price']);
          const stock = Number(m.data['stock']);
          if (
            ![mrp, price, stock].every(Number.isFinite) ||
            price <= 0 ||
            price > mrp ||
            stock < 0 ||
            !Number.isInteger(stock)
          ) {
            fail(
              m.row,
              'price must be > 0 and ≤ mrp, stock must be a whole number ≥ 0',
              variant.sku,
            );
            continue;
          }
          if (stock < (variant.inventory?.reserved ?? 0)) {
            fail(
              m.row,
              `stock cannot be below ${variant.inventory?.reserved} reserved units`,
              variant.sku,
            );
            continue;
          }
          await this.prisma.$transaction([
            this.prisma.productVariant.update({ where: { id: variant.id }, data: { mrp, price } }),
            this.prisma.inventory.upsert({
              where: { variantId: variant.id },
              create: { variantId: variant.id, quantity: stock },
              update: { quantity: stock },
            }),
          ]);
          touched.add(variant.productId);
          report.updated += 1;
        }
        for (const pid of touched) {
          await this.aggregates.recomputePricing(pid);
          await this.aggregates.recomputeStock([pid]);
          await this.aggregates.invalidateDetail([pid]);
        }
        continue;
      }

      // ── create mode ──
      const categoryId = categoryBySlug.get((first.data['category'] ?? '').toLowerCase());
      if (!categoryId) {
        fail(first.row, `Unknown category slug "${first.data['category'] ?? ''}"`, skus[0]);
        continue;
      }
      const brandName = first.data['brand'];
      const brandId = brandName ? brandByName.get(brandName.toLowerCase()) : undefined;
      if (brandName && !brandId) {
        fail(first.row, `Unknown brand "${brandName}"`, skus[0]);
        continue;
      }

      const catAttrs = await this.categories.attributesFor(categoryId);
      const axisSlugs = new Set(catAttrs.filter((a) => a.isVariantAxis).map((a) => a.slug));
      const productAttributes: Record<string, string> = {};
      const variants = members.map((m) => {
        const attributes: Record<string, string> = {};
        for (const [col, val] of Object.entries(m.data)) {
          if (!col.startsWith('attr_') || !val) continue;
          const slug = col.slice(5);
          if (axisSlugs.has(slug) || !catAttrs.some((a) => a.slug === slug)) attributes[slug] = val;
          else productAttributes[slug] = val;
        }
        return {
          sku: m.data['sku'] ?? '',
          name: m.data['variant_name'] || undefined,
          attributes,
          mrp: Number(m.data['mrp']),
          price: Number(m.data['price']),
          stock: Number(m.data['stock']),
          isActive: true,
        };
      });

      const candidate: ProductInput = {
        name: first.data['name'] ?? '',
        categoryId,
        brandId: brandId ?? null,
        description: first.data['description'] ?? '',
        highlights: (first.data['highlights'] ?? '')
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean),
        specifications: (first.data['specifications'] ?? '')
          .split('|')
          .map((s) => s.split(':'))
          .filter((p) => p.length >= 2 && p[0]?.trim())
          .map((p) => ({ key: (p[0] as string).trim(), value: p.slice(1).join(':').trim() })),
        attributes: productAttributes,
        tags: [],
        gstRate: Number(first.data['gst_rate'] || 18),
        hsnCode: first.data['hsn'] || undefined,
        images: (first.data['images'] ?? '')
          .split('|')
          .map((u) => u.trim())
          .filter(Boolean)
          .map((url) => ({ url })),
        variants,
        isReturnable: true,
        returnWindowDays: 7,
        submit: true,
      };

      const parsed = productInputSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const variantIdx = issue.path[0] === 'variants' ? Number(issue.path[1]) : 0;
          const m = members[Number.isInteger(variantIdx) ? variantIdx : 0] ?? first;
          fail(m.row, `${issue.path.join('.')}: ${issue.message}`, m.data['sku']);
        }
        continue;
      }
      try {
        await this.products.create(sellerId, parsed.data);
        report.created += 1;
      } catch (err) {
        if (err instanceof AppException) fail(first.row, err.message, skus[0]);
        else throw err;
      }
    }

    report.failed = failedRows.size;
    return report;
  }
}
