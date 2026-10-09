import { z } from 'zod';
import { paginationQuerySchema, queryBoolean } from './common';

export const variantInputSchema = z
  .object({
    id: z.string().optional(),
    sku: z
      .string()
      .trim()
      .min(3, 'SKU is too short')
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, . _ - only'),
    name: z.string().trim().max(80).optional(),
    attributes: z.record(z.string(), z.string().max(60)).default({}),
    mrp: z.number().positive('MRP must be greater than 0').max(10_000_000),
    price: z.number().positive('Price must be greater than 0').max(10_000_000),
    stock: z.number().int().min(0).max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    weightGrams: z.number().int().min(0).max(1_000_000).optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.price <= v.mrp, { message: 'Selling price cannot exceed MRP', path: ['price'] });
export type VariantInput = z.input<typeof variantInputSchema>;

export const productImageInputSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  alt: z.string().trim().max(160).optional(),
  publicId: z.string().max(200).optional(),
  /** SKU of the variant this image belongs to; omit for shared gallery images. */
  variantSku: z.string().max(40).optional(),
});

export const productInputSchema = z.object({
  name: z.string().trim().min(5, 'Name is too short').max(160),
  categoryId: z.string().min(1, 'Select a category'),
  brandId: z.string().nullable().optional(),
  description: z.string().trim().min(20, 'Describe the product (20+ characters)').max(8000),
  highlights: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  specifications: z
    .array(
      z.object({ key: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) }),
    )
    .max(40)
    .default([]),
  /** Non-variant dynamic attributes (material, fit…) keyed by attribute slug */
  attributes: z.record(z.string(), z.string().max(120)).default({}),
  tags: z.array(z.string().trim().min(1).max(30)).max(15).default([]),
  gstRate: z
    .number()
    .refine((v) => [0, 0.25, 3, 5, 12, 18, 28].includes(v), 'Choose a valid GST slab'),
  hsnCode: z.string().trim().max(10).optional().or(z.literal('')),
  isReturnable: z.boolean().default(true),
  returnWindowDays: z.number().int().min(0).max(30).default(7),
  seoTitle: z.string().trim().max(70).optional().or(z.literal('')),
  seoDescription: z.string().trim().max(160).optional().or(z.literal('')),
  images: z.array(productImageInputSchema).min(1, 'Add at least one image').max(10),
  variants: z.array(variantInputSchema).min(1, 'Add at least one variant').max(100),
  /** true → submit for admin moderation; false → keep as draft */
  submit: z.boolean().default(true),
});
export type ProductInput = z.input<typeof productInputSchema>;
export type ProductOutput = z.output<typeof productInputSchema>;

export const productSortSchema = z.enum([
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'popularity',
  'rating',
  'discount',
]);
export type ProductSort = z.infer<typeof productSortSchema>;

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  );

/**
 * Listing / search query. Dynamic attribute filters arrive as `attr_<slug>=A,B`
 * and are read separately by the service (`catchall`).
 */
export const productListQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().max(120).optional(),
    category: z.string().trim().max(120).optional(),
    brand: csv,
    seller: csv,
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    rating: z.coerce.number().min(1).max(5).optional(),
    discount: z.coerce.number().min(0).max(95).optional(),
    inStock: queryBoolean,
    sort: productSortSchema.optional(),
  })
  .catchall(z.string());
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const sellerProductQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED']).optional(),
  sort: z
    .enum([
      'newest',
      'oldest',
      'name',
      'stock',
      'sold',
      'createdAt',
      'totalStock',
      'soldCount',
      'minPrice',
    ])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
export type SellerProductQuery = z.infer<typeof sellerProductQuerySchema>;

export const productRejectSchema = z.object({
  reason: z.string().trim().min(5, 'Give the seller a clear reason').max(500),
});

export const recommendedQuerySchema = z.object({
  viewed: csv,
  limit: z.coerce.number().int().min(1).max(40).default(12),
});

export const pincodeCheckQuerySchema = z.object({
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
});
