/**
 * String enums mirrored from the Prisma schema. They are declared as const objects + unions so
 * the web and mobile bundles never need to import the Prisma client.
 */

export const Role = {
  CUSTOMER: 'CUSTOMER',
  SELLER: 'SELLER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SellerStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type SellerStatus = (typeof SellerStatus)[keyof typeof SellerStatus];

export const KycDocType = {
  PAN: 'PAN',
  GSTIN_CERTIFICATE: 'GSTIN_CERTIFICATE',
  BANK_PROOF: 'BANK_PROOF',
  ID_PROOF: 'ID_PROOF',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  OTHER: 'OTHER',
} as const;
export type KycDocType = (typeof KycDocType)[keyof typeof KycDocType];

export const KycStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PLACED: 'PLACED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const SubOrderStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
} as const;
export type SubOrderStatus = (typeof SubOrderStatus)[keyof typeof SubOrderStatus];

export const PaymentMethod = { RAZORPAY: 'RAZORPAY', COD: 'COD' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ReturnStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED',
  PICKED_UP: 'PICKED_UP',
  RECEIVED: 'RECEIVED',
  REFUNDED: 'REFUNDED',
  CLOSED: 'CLOSED',
} as const;
export type ReturnStatus = (typeof ReturnStatus)[keyof typeof ReturnStatus];

export const CouponType = { FLAT: 'FLAT', PERCENTAGE: 'PERCENTAGE' } as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];

export const PayoutStatus = { PENDING: 'PENDING', SETTLED: 'SETTLED' } as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const CommissionScope = {
  GLOBAL: 'GLOBAL',
  CATEGORY: 'CATEGORY',
  SELLER: 'SELLER',
} as const;
export type CommissionScope = (typeof CommissionScope)[keyof typeof CommissionScope];

export const NotificationType = {
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  PROMO: 'PROMO',
  SELLER: 'SELLER',
  PRODUCT: 'PRODUCT',
  REVIEW: 'REVIEW',
  QNA: 'QNA',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const BannerPlacement = { HERO: 'HERO', SECONDARY: 'SECONDARY', STRIP: 'STRIP' } as const;
export type BannerPlacement = (typeof BannerPlacement)[keyof typeof BannerPlacement];

export const AttributeType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  SELECT: 'SELECT',
  COLOR: 'COLOR',
} as const;
export type AttributeType = (typeof AttributeType)[keyof typeof AttributeType];

export const AddressType = { HOME: 'HOME', WORK: 'WORK', OTHER: 'OTHER' } as const;
export type AddressType = (typeof AddressType)[keyof typeof AddressType];

export const RETURN_REASONS = [
  'Product damaged or defective',
  'Wrong item received',
  'Item not as described',
  'Size or fit issue',
  'Quality not as expected',
  'Changed my mind',
] as const;

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.SUPER_ADMIN];
