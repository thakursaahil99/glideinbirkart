import { z } from 'zod';
import { paginationQuerySchema, queryBoolean } from './common';

export const reviewInputSchema = z.object({
  productId: z.string().min(1),
  orderItemId: z.string().optional(),
  rating: z.number().int().min(1, 'Pick a rating').max(5),
  title: z.string().trim().max(100).optional(),
  body: z.string().trim().max(2000).optional(),
  images: z.array(z.string().max(2000)).max(5).default([]),
});
export type ReviewInput = z.input<typeof reviewInputSchema>;

export const reviewReplySchema = z.object({ body: z.string().trim().min(2).max(1000) });
export type ReviewReplyInput = z.infer<typeof reviewReplySchema>;

export const reviewListQuerySchema = paginationQuerySchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['recent', 'helpful', 'high', 'low']).default('recent'),
  withImages: queryBoolean,
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const questionInputSchema = z.object({
  productId: z.string().min(1),
  body: z.string().trim().min(5, 'Ask a complete question').max(300),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const answerInputSchema = z.object({ body: z.string().trim().min(2).max(1000) });
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const notificationQuerySchema = paginationQuerySchema.extend({
  unreadOnly: queryBoolean,
});
