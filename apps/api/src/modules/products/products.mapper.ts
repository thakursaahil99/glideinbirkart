import { Prisma } from '@gk/db';
import type { ImageDto, ProductSummary } from '@gk/types';

/** Fields needed to render a product card / summary. */
export const summaryInclude = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, storeName: true, slug: true } },
  images: {
    orderBy: { position: 'asc' as const },
    take: 1,
    where: { variantId: null },
    select: { url: true },
  },
  variants: {
    where: { isActive: true, deletedAt: null },
    orderBy: [{ price: 'asc' as const }, { position: 'asc' as const }],
    select: {
      id: true,
      price: true,
      isDefault: true,
      inventory: { select: { quantity: true, reserved: true } },
    },
  },
} satisfies Prisma.ProductInclude;

export type SummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;

export const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d);

export const available = (
  inv: { quantity: number; reserved: number } | null | undefined,
): number => (inv ? Math.max(inv.quantity - inv.reserved, 0) : 0);

export function toSummary(p: SummaryRow): ProductSummary {
  const inStockVariants = p.variants.filter((v) => available(v.inventory) > 0);
  // cheapest variant that can actually be bought, else the cheapest overall
  const pick = inStockVariants[0] ?? p.variants[0];
  const pickStock = pick ? available(pick.inventory) : 0;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    seller: p.seller,
    image: p.images[0]?.url ?? null,
    price: num(p.minPrice),
    mrp: num(p.minMrp),
    discountPercent: p.discountPercent,
    ratingAvg: num(p.ratingAvg),
    ratingCount: p.ratingCount,
    inStock: inStockVariants.length > 0,
    lowStock: inStockVariants.length > 0 && pickStock > 0 && pickStock <= 5,
    soldCount: p.soldCount,
    defaultVariantId: pick?.id ?? null,
    hasVariants: p.variants.length > 1,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toImageDto(i: {
  id: string;
  url: string;
  alt: string | null;
  position: number;
  variantId: string | null;
}): ImageDto {
  return { id: i.id, url: i.url, alt: i.alt, position: i.position, variantId: i.variantId };
}
