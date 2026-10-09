import { z } from 'zod';
import { RETURN_REASONS } from '@gk/types';
import { paginationQuerySchema } from './common';

export const checkoutSchema = z.object({
  addressId: z.string().min(1, 'Select a delivery address'),
  paymentMethod: z.enum(['RAZORPAY', 'COD']),
  notes: z.string().trim().max(300).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const paymentFailedSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().max(300).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Tell us why you are cancelling').max(300),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const returnRequestSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  reason: z.enum(RETURN_REASONS),
  description: z.string().trim().max(1000).optional(),
  images: z.array(z.string().max(2000)).max(5).default([]),
});
export type ReturnRequestInput = z.input<typeof returnRequestSchema>;

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum([
      'PENDING_PAYMENT',
      'PLACED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'PAYMENT_FAILED',
    ])
    .optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const sellerOrderQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['PENDING', 'ACCEPTED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'])
    .optional(),
  q: z.string().trim().max(60).optional(),
  sort: z.enum(['createdAt', 'total', 'subOrderNumber']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
export type SellerOrderQuery = z.infer<typeof sellerOrderQuerySchema>;

export const razorpayWebhookSchema = z
  .object({
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
