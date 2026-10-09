import { z } from 'zod';
import { INDIAN_STATE_NAMES } from '@gk/utils';
import {
  bankAccountSchema,
  emailSchema,
  gstinSchema,
  ifscSchema,
  panSchema,
  phoneSchema,
  pincodeSchema,
} from './common';

export const sellerBusinessSchema = z.object({
  storeName: z.string().trim().min(3, 'Store name is too short').max(60),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  logoUrl: z.string().trim().max(2000).optional().or(z.literal('')),
  businessName: z.string().trim().min(2, 'Enter the registered business name').max(120),
  businessType: z.enum(['INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP']),
  gstin: gstinSchema,
  pan: panSchema,
  contactEmail: emailSchema,
  contactPhone: phoneSchema,
});
export type SellerBusinessInput = z.infer<typeof sellerBusinessSchema>;

export const sellerBankSchema = z.object({
  bankAccountName: z.string().trim().min(2).max(80),
  bankAccountNumber: bankAccountSchema,
  bankIfsc: ifscSchema,
  bankName: z.string().trim().min(2).max(80),
});
export type SellerBankInput = z.infer<typeof sellerBankSchema>;

export const sellerPickupSchema = z.object({
  pickupLine1: z.string().trim().min(3).max(150),
  pickupLine2: z.string().trim().max(150).optional().or(z.literal('')),
  pickupCity: z.string().trim().min(2).max(60),
  pickupState: z.enum(INDIAN_STATE_NAMES as [string, ...string[]], { error: 'Select a state' }),
  pickupPincode: pincodeSchema,
});
export type SellerPickupInput = z.infer<typeof sellerPickupSchema>;

export const kycDocumentSchema = z.object({
  docType: z.enum(['PAN', 'GSTIN_CERTIFICATE', 'BANK_PROOF', 'ID_PROOF', 'ADDRESS_PROOF', 'OTHER']),
  fileUrl: z.string().trim().min(1).max(2000),
  fileName: z.string().trim().max(200).optional(),
});
export type KycDocumentInput = z.infer<typeof kycDocumentSchema>;

export const sellerSettingsSchema = z.object({
  storeName: z.string().trim().min(3).max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  logoUrl: z.string().trim().max(2000).optional(),
});

export const shipSubOrderSchema = z.object({
  courier: z.string().trim().min(2, 'Enter the courier name').max(60),
  trackingId: z.string().trim().min(4, 'Enter the tracking / AWB number').max(60),
  trackingUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
});
export type ShipSubOrderInput = z.infer<typeof shipSubOrderSchema>;

export const cancelSubOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason').max(300),
});

export const inventoryUpdateSchema = z.object({
  quantity: z.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
});
export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>;

export const returnDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  remarks: z.string().trim().max(500).optional(),
});
export type ReturnDecisionInput = z.infer<typeof returnDecisionSchema>;
