import { z } from 'zod';
import {
  BANK_ACCOUNT_REGEX,
  GSTIN_REGEX,
  IFSC_REGEX,
  PAN_REGEX,
  PINCODE_REGEX,
  normalizePhone,
  PHONE_REGEX,
} from '@gk/utils';

export const idSchema = z.string().min(1, 'Required').max(64);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/** Accepts "+91 98765 43210" and normalises to the 10-digit national number. */
export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(PHONE_REGEX, 'Enter a valid 10-digit Indian mobile number'));

export const pincodeSchema = z
  .string()
  .trim()
  .regex(PINCODE_REGEX, 'Enter a valid 6-digit PIN code');

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_REGEX, 'Enter a valid 15-character GSTIN');

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN_REGEX, 'Enter a valid PAN (ABCDE1234F)');

export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(IFSC_REGEX, 'Enter a valid IFSC code');

export const bankAccountSchema = z
  .string()
  .trim()
  .regex(BANK_ACCOUNT_REGEX, 'Account number must be 9–18 digits');

export const moneySchema = z.number().finite().min(0).max(100_000_000);

export const urlSchema = z.string().trim().min(1).max(2000);

/** Optional text input from HTML forms: empty string → undefined. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const dateRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const searchTextQuerySchema = z.object({ q: z.string().trim().max(120).optional() });

/** Query-string boolean: 'true'/'1' → true, 'false'/'0' → false (z.coerce.boolean would treat 'false' as true). */
export const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1'));
