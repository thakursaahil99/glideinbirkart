import { z } from 'zod';
import { INDIAN_STATE_NAMES } from '@gk/utils';
import { phoneSchema, pincodeSchema } from './common';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phoneSchema.optional(),
  avatarUrl: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(3, 'Enter house / flat / street').max(150),
  line2: z.string().trim().max(150).optional().or(z.literal('')),
  landmark: z.string().trim().max(100).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter city').max(60),
  state: z.enum(INDIAN_STATE_NAMES as [string, ...string[]], { error: 'Select a state' }),
  pincode: pincodeSchema,
  type: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressSchema>;
export type AddressOutput = z.output<typeof addressSchema>;

export const pushTokenSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['expo', 'ios', 'android', 'web']).default('expo'),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;
