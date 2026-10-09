import { z } from 'zod';

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  parentId: z.string().nullable().optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  imageUrl: z.string().trim().max(2000).optional().or(z.literal('')),
  icon: z.string().trim().max(40).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** Drag-and-drop reorder: full list of nodes with new parent + order. */
export const categoryReorderSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(2000),
});
export type CategoryReorderInput = z.infer<typeof categoryReorderSchema>;

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  logoUrl: z.string().trim().max(2000).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

export const attributeInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(['TEXT', 'NUMBER', 'SELECT', 'COLOR']),
  unit: z.string().trim().max(16).optional().or(z.literal('')),
  isFilterable: z.boolean().optional(),
  values: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(60),
        hex: z.string().trim().max(9).optional(),
      }),
    )
    .max(200)
    .optional(),
});
export type AttributeInput = z.infer<typeof attributeInputSchema>;

export const categoryAttributesSchema = z.object({
  attributes: z
    .array(
      z.object({
        attributeId: z.string(),
        isRequired: z.boolean().default(false),
        isVariantAxis: z.boolean().default(false),
      }),
    )
    .max(30),
});
export type CategoryAttributesInput = z.infer<typeof categoryAttributesSchema>;
