import type { PrismaClient, ProductStatus } from '@prisma/client';
import { discountPercent, slugify } from '@gk/utils';
import { iconFor } from './catalog';
import { PRODUCTS, type ProductDef } from './product-defs';
import { chance, daysAgo, productImageUrl, rand } from './util';

export interface SeededVariant {
  id: string;
  sku: string;
  name: string;
  productId: string;
  productName: string;
  productSlug: string;
  sellerId: string;
  categorySlug: string;
  categoryPath: string;
  brand: string;
  mrp: number;
  price: number;
  gstRate: number;
  image: string;
  stock: number;
  attributes: Record<string, string>;
}

export interface SeededProduct {
  id: string;
  name: string;
  slug: string;
  sellerId: string;
  categorySlug: string;
  variants: SeededVariant[];
  status: ProductStatus;
}

/** Products that exercise the moderation workflow (not visible on the storefront). */
const EXTRA: Array<ProductDef & { status: ProductStatus; rejectionReason?: string }> = [
  {
    leaf: 'headphones',
    brand: 'Zenith Audio',
    name: 'Zenith Studio Monitor Headphones (New)',
    seller: 0,
    mrp: 5499,
    off: 30,
    gst: 18,
    hsn: '8518',
    blurb: 'Flat-response studio monitoring headphones for mixing and tracking.',
    highlights: ['Flat frequency response', 'Detachable cable'],
    specs: [['Driver', '50 mm']],
    axes: { color: ['Black'] },
    status: 'PENDING_REVIEW',
  },
  {
    leaf: 'mens-tshirts',
    brand: 'Urban Weave',
    name: 'Urban Weave Striped Polo T-Shirt (New)',
    seller: 1,
    mrp: 1199,
    off: 45,
    gst: 5,
    hsn: '6109',
    blurb: 'Pique polo with a classic striped collar.',
    highlights: ['Pique cotton', 'Two-button placket'],
    specs: [['Fabric', 'Cotton']],
    axes: { size: ['M', 'L'], color: ['Navy', 'White'] },
    attrs: { material: 'Cotton' },
    status: 'PENDING_REVIEW',
  },
  {
    leaf: 'skincare',
    brand: 'Glow Ritual',
    name: 'Glow Ritual Retinol Night Cream',
    seller: 2,
    mrp: 1299,
    off: 35,
    gst: 18,
    hsn: '3304',
    blurb: 'A gentle 0.3% retinol night cream to smooth fine lines.',
    highlights: ['0.3% retinol', 'Fragrance-free'],
    specs: [['Volume', '50 g']],
    status: 'REJECTED',
    rejectionReason:
      'Product images are low resolution and the ingredient list is missing. Please upload clear photos and add ingredients to the description.',
  },
  {
    leaf: 'toys',
    brand: 'LittleLark',
    name: 'LittleLark Wooden Puzzle Train (Draft)',
    seller: 2,
    mrp: 799,
    off: 30,
    gst: 12,
    hsn: '9503',
    blurb: 'A chunky wooden train puzzle for little hands.',
    highlights: ['Chunky pieces'],
    specs: [['Age', '2+']],
    status: 'DRAFT',
  },
];

const BRAND_CODE = (b: string) =>
  b
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();

function cartesian(axes: Record<string, string[]> | undefined): Array<Record<string, string>> {
  if (!axes || Object.keys(axes).length === 0) return [{}];
  let combos: Array<Record<string, string>> = [{}];
  for (const [key, values] of Object.entries(axes)) {
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
  }
  return combos;
}

const niceFloor = (x: number, mrp: number) => {
  const r = x >= 100 ? Math.round(x / 10) * 10 - 1 : Math.round(x);
  return Math.max(Math.min(r, mrp - 1), 1);
};

export async function seedProducts(
  prisma: PrismaClient,
  ctx: {
    categoryIds: Map<string, string>;
    categoryPaths: Map<string, string>;
    brandIds: Map<string, string>;
    sellerIds: [string, string, string];
  },
): Promise<SeededProduct[]> {
  const all: Array<ProductDef & { status?: ProductStatus; rejectionReason?: string }> = [
    ...PRODUCTS,
    ...EXTRA,
  ];
  const out: SeededProduct[] = [];
  const usedSlugs = new Set<string>();

  for (const [idx, def] of all.entries()) {
    const categoryId = ctx.categoryIds.get(def.leaf);
    if (!categoryId) throw new Error(`Unknown category ${def.leaf}`);
    const status: ProductStatus = def.status ?? 'ACTIVE';
    let slug = slugify(def.name);
    if (usedSlugs.has(slug)) slug = `${slug}-${idx}`;
    usedSlugs.add(slug);

    const productId = `prd_${String(idx + 1).padStart(3, '0')}`;
    const sellerId = ctx.sellerIds[def.seller];
    const icon = iconFor(def.leaf);
    const combos = cartesian(def.axes);

    const variants = combos.map((attrs, j) => {
      const bump = Object.entries(def.bump ?? {}).reduce((sum, [axis, steps]) => {
        const values = def.axes?.[axis] ?? [];
        const at = values.indexOf(attrs[axis] ?? '');
        return sum + (steps[at] ?? 0);
      }, 0);
      const mrpFinal =
        bump === 0 ? def.mrp : Math.max(Math.round((def.mrp * (1 + bump)) / 10) * 10 - 1, 49);
      const price = niceFloor(mrpFinal * (1 - def.off / 100), mrpFinal);
      const name = Object.values(attrs).join(' / ') || 'Default';
      const lowStock = chance(0.07);
      const stock = idx === 2 && j === 0 ? 0 : lowStock ? rand(1, 4) : rand(14, 95);
      return {
        id: `var_${String(idx + 1).padStart(3, '0')}_${j + 1}`,
        sku: `${BRAND_CODE(def.brand)}-${String(idx + 1).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
        name,
        attrs,
        mrp: mrpFinal,
        price,
        stock,
        position: j,
      };
    });

    const cheapest = [...variants].sort(
      (a, b) => a.price - b.price,
    )[0] as (typeof variants)[number];
    const priceVals = variants.map((v) => v.price);
    const sold =
      status === 'ACTIVE'
        ? Math.round((rand(30, 700) * (def.mrp < 2000 ? 1.6 : def.mrp < 10000 ? 1 : 0.4)) | 0)
        : 0;
    const createdAt = daysAgo(rand(2, 150));

    await prisma.product.create({
      data: {
        id: productId,
        sellerId,
        categoryId,
        brandId: ctx.brandIds.get(def.brand) ?? null,
        name: def.name,
        slug,
        description: `${def.blurb}\n\n${def.highlights.map((h) => `• ${h}`).join('\n')}\n\nSold and fulfilled by a verified Glideinbir Kart seller. 7-day easy returns on eligible items.`,
        highlights: def.highlights,
        specifications: def.specs.map(([key, value]) => ({ key, value })),
        attributes: def.attrs ?? {},
        tags: [...(def.tags ?? []), def.brand.toLowerCase(), def.leaf.replace(/-/g, ' ')],
        status,
        rejectionReason: def.rejectionReason ?? null,
        gstRate: def.gst,
        hsnCode: def.hsn,
        minPrice: cheapest.price,
        maxPrice: Math.max(...priceVals),
        minMrp: cheapest.mrp,
        discountPercent: discountPercent(cheapest.mrp, cheapest.price),
        totalStock: variants.reduce((n, v) => n + v.stock, 0),
        soldCount: sold,
        viewCount: sold * rand(9, 22),
        isReturnable: def.leaf !== 'fragrances' && def.leaf !== 'skincare',
        returnWindowDays:
          def.leaf === 'fragrances' || def.leaf === 'skincare'
            ? 0
            : def.leaf === 'televisions' || def.leaf === 'sofas'
              ? 10
              : 7,
        seoTitle: `${def.name} | Buy online at Glideinbir Kart`,
        seoDescription: def.blurb.slice(0, 155),
        publishedAt: status === 'ACTIVE' ? createdAt : null,
        createdAt,
        variants: {
          create: variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            name: v.name,
            attributes: v.attrs,
            mrp: v.mrp,
            price: v.price,
            position: v.position,
            isDefault: v.position === 0,
            inventory: { create: { quantity: v.stock, lowStockThreshold: 5 } },
          })),
        },
      },
    });

    // gallery (4 angles) + one image per colour for the first variant of that colour
    const images: Array<{
      productId: string;
      variantId: string | null;
      url: string;
      alt: string;
      position: number;
    }> = [];
    for (let v = 0; v < 4; v++) {
      images.push({
        productId,
        variantId: null,
        url: productImageUrl(`${slug}-g${v}`, def.name, icon, v, def.brand),
        alt: `${def.name} — view ${v + 1}`,
        position: v,
      });
    }
    const seenColors = new Set<string>();
    for (const v of variants) {
      const color = v.attrs['color'];
      if (!color || seenColors.has(color) || !(def.axes && 'color' in def.axes)) continue;
      seenColors.add(color);
      images.push({
        productId,
        variantId: v.id,
        url: productImageUrl(
          `${slug}-${slugify(color)}`,
          `${def.name} — ${color}`,
          icon,
          seenColors.size,
          def.brand,
        ),
        alt: `${def.name} in ${color}`,
        position: 10 + seenColors.size,
      });
    }
    await prisma.productImage.createMany({ data: images });

    out.push({
      id: productId,
      name: def.name,
      slug,
      sellerId,
      categorySlug: def.leaf,
      status,
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        productId,
        productName: def.name,
        productSlug: slug,
        sellerId,
        categorySlug: def.leaf,
        categoryPath: ctx.categoryPaths.get(def.leaf) ?? def.leaf,
        brand: def.brand,
        mrp: v.mrp,
        price: v.price,
        gstRate: def.gst,
        image: images[0]?.url ?? '',
        stock: v.stock,
        attributes: v.attrs,
      })),
    });
  }
  return out;
}
