import { z } from 'zod';
import {
  THEME_COLOR_KEYS,
  THEME_DISPLAY_FONTS,
  THEME_SANS_FONTS,
  type ThemeColorKey,
} from '@gk/types';
import { paginationQuerySchema, pincodeSchema } from './common';

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, 'Use 3–24 letters, numbers, - or _'),
    description: z.string().trim().max(200).optional().or(z.literal('')),
    type: z.enum(['FLAT', 'PERCENTAGE']),
    value: z.number().positive(),
    minOrderAmount: z.number().min(0).default(0),
    maxDiscount: z.number().positive().nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().min(1).max(100).default(1),
    startsAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.type !== 'PERCENTAGE' || v.value <= 100, {
    message: 'Percentage cannot exceed 100',
    path: ['value'],
  })
  .refine((v) => !v.startsAt || !v.expiresAt || v.expiresAt > v.startsAt, {
    message: 'Expiry must be after the start date',
    path: ['expiresAt'],
  });
export type CouponInput = z.input<typeof couponInputSchema>;
export type CouponOutput = z.output<typeof couponInputSchema>;

export const bannerInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  subtitle: z.string().trim().max(200).optional().or(z.literal('')),
  imageUrl: z.string().trim().min(1).max(2000),
  mobileImageUrl: z.string().trim().max(2000).optional().or(z.literal('')),
  linkUrl: z.string().trim().max(500).optional().or(z.literal('')),
  ctaText: z.string().trim().max(30).optional().or(z.literal('')),
  bgColor: z.string().trim().max(9).optional().or(z.literal('')),
  placement: z.enum(['HERO', 'SECONDARY', 'STRIP']).default('HERO'),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
export type BannerInput = z.input<typeof bannerInputSchema>;
export type BannerOutput = z.output<typeof bannerInputSchema>;

export const commissionRuleInputSchema = z
  .object({
    scope: z.enum(['GLOBAL', 'CATEGORY', 'SELLER']),
    categoryId: z.string().nullable().optional(),
    sellerId: z.string().nullable().optional(),
    rate: z.number().min(0).max(60),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.scope !== 'CATEGORY' || !!v.categoryId, {
    message: 'Pick a category',
    path: ['categoryId'],
  })
  .refine((v) => v.scope !== 'SELLER' || !!v.sellerId, {
    message: 'Pick a seller',
    path: ['sellerId'],
  });
export type CommissionRuleInput = z.input<typeof commissionRuleInputSchema>;

export const cmsPageInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, 'Lowercase letters, numbers and hyphens'),
  title: z.string().trim().min(2).max(120),
  content: z.string().min(1).max(60_000),
  isPublished: z.boolean().default(true),
});
export type CmsPageInput = z.input<typeof cmsPageInputSchema>;

export const siteSettingsSchema = z.object({
  deliveryFee: z.number().min(0).max(2000),
  freeDeliveryThreshold: z.number().min(0).max(1_000_000),
  codEnabled: z.boolean(),
  codMaxAmount: z.number().min(0).max(1_000_000),
  onlinePaymentsEnabled: z.boolean(),
  supportEmail: z.email(),
  supportPhone: z.string().trim().min(5).max(20),
  defaultCommissionRate: z.number().min(0).max(60),
  payoutHoldDays: z.number().int().min(0).max(60),
  lowStockThreshold: z.number().int().min(0).max(1000),
});
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

/** Admin → send an offer / announcement to app users (in-app inbox + mobile push). */
export const broadcastSchema = z.object({
  title: z.string().trim().min(3, 'Add a short title').max(70),
  body: z.string().trim().min(3, 'Write the message').max(240),
  audience: z.enum(['CUSTOMERS', 'ALL']).default('CUSTOMERS'),
  /** Optional deep link: tapping the notification opens this product in the app. */
  productSlug: z.string().trim().max(160).optional().or(z.literal('')),
});
export type BroadcastInput = z.input<typeof broadcastSchema>;
export type BroadcastOutput = z.output<typeof broadcastSchema>;

export const serviceablePincodeSchema = z.object({
  pincode: pincodeSchema,
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  deliveryDays: z.number().int().min(1).max(30),
  codAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type ServiceablePincodeInput = z.input<typeof serviceablePincodeSchema>;

export const sellerDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND']),
    remarks: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision === 'APPROVE' || (v.remarks && v.remarks.length >= 5), {
    message: 'Remarks are required when rejecting or suspending',
    path: ['remarks'],
  });
export type SellerDecisionInput = z.infer<typeof sellerDecisionSchema>;

export const kycReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  remarks: z.string().trim().max(300).optional(),
});

export const blockUserSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export const adminReturnDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REFUND']),
  remarks: z.string().trim().max(500).optional(),
  refundAmount: z.number().positive().optional(),
});
export type AdminReturnDecisionInput = z.infer<typeof adminReturnDecisionSchema>;

export const refundOrderSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().trim().min(3).max(300),
});

export const payoutGenerateSchema = z.object({
  sellerId: z.string().optional(),
  upTo: z.coerce.date().optional(),
});

export const payoutSettleSchema = z.object({
  reference: z.string().trim().min(3, 'Enter the bank reference / UTR').max(80),
  notes: z.string().trim().max(300).optional(),
});

export const adminListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(80).optional(),
  status: z.string().trim().max(30).optional(),
  role: z.string().trim().max(20).optional(),
  sort: z.string().trim().max(30).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  entityType: z.string().trim().max(40).optional(),
  action: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

export const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #402dbe')
  .transform((v) => v.toLowerCase());
const paletteShape = Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, hexColor])) as Record<
  ThemeColorKey,
  typeof hexColor
>;

/** Admin → Appearance. Colours are `#rrggbb`; the API converts them to the HSL variables the apps consume. */
export const themeSettingsSchema = z.object({
  siteName: z.string().trim().min(2).max(40),
  tagline: z.string().trim().max(120),
  logoUrl: z
    .union([z.url().max(500), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  radius: z.number().min(0).max(1.5),
  fontDisplay: z.enum(THEME_DISPLAY_FONTS),
  fontSans: z.enum(THEME_SANS_FONTS),
  light: z.object(paletteShape),
  dark: z.object(paletteShape),
});
export type ThemeSettingsInput = z.input<typeof themeSettingsSchema>;
