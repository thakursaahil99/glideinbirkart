import { z } from 'zod';

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(10).default(1),
});
export type AddToCartInput = z.input<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(10),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .transform((v) => v.toUpperCase()),
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

export const mergeCartSchema = z.object({ guestCartId: z.string().min(8).max(64) });

export const wishlistToggleSchema = z.object({ productId: z.string().min(1) });
export const recentlyViewedSchema = z.object({ productId: z.string().min(1) });
