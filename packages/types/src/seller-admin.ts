import type {
  BannerPlacement,
  CommissionScope,
  CouponType,
  KycDocType,
  KycStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  ProductStatus,
  ReturnStatus,
  Role,
  SellerStatus,
  SubOrderStatus,
} from './enums';
import type {
  AddressDto,
  ImageDto,
  ProductSummary,
  ShippingAddressSnapshot,
  OrderItemDto,
  StatusHistoryDto,
} from './models';

// ───────────── Seller ─────────────

export interface KycDocumentDto {
  id: string;
  docType: KycDocType;
  fileUrl: string;
  fileName: string | null;
  status: KycStatus;
  remarks: string | null;
  createdAt: string;
}

export interface SellerProfileDto {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  businessName: string | null;
  businessType: string | null;
  gstin: string | null;
  pan: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  pickupLine1: string | null;
  pickupLine2: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupPincode: string | null;
  status: SellerStatus;
  onboardingStep: number;
  adminRemarks: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  ratingAvg: number;
  ratingCount: number;
  kycDocuments: KycDocumentDto[];
  createdAt: string;
}

export interface SellerVariantDto {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  mrp: number;
  price: number;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  weightGrams: number | null;
  isActive: boolean;
  isDefault: boolean;
}

export interface SellerProductDto {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  rejectionReason: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string | null;
  brandName: string | null;
  description: string;
  highlights: string[];
  specifications: Array<{ key: string; value: string }>;
  attributes: Record<string, string>;
  tags: string[];
  gstRate: number;
  hsnCode: string | null;
  isReturnable: boolean;
  returnWindowDays: number;
  seoTitle: string | null;
  seoDescription: string | null;
  images: ImageDto[];
  variants: SellerVariantDto[];
  minPrice: number;
  totalStock: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SellerProductRow {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  status: ProductStatus;
  rejectionReason: string | null;
  categoryName: string;
  minPrice: number;
  totalStock: number;
  variantCount: number;
  soldCount: number;
  createdAt: string;
}

export interface InventoryRow {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  variantName: string;
  image: string | null;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  isLow: boolean;
}

export interface BulkUploadReport {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
}

export interface SellerSubOrderRow {
  id: string;
  subOrderNumber: string;
  orderId: string;
  orderNumber: string;
  status: SubOrderStatus;
  customerName: string;
  city: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  itemCount: number;
  total: number;
  sellerEarning: number;
  createdAt: string;
}

export interface SellerSubOrderDetail extends SellerSubOrderRow {
  items: OrderItemDto[];
  shippingAddress: ShippingAddressSnapshot;
  courier: string | null;
  trackingId: string | null;
  trackingUrl: string | null;
  commissionRate: number;
  commissionAmount: number;
  timeline: StatusHistoryDto[];
}

export interface SellerReturnRow {
  id: string;
  orderNumber: string;
  subOrderId: string;
  itemName: string;
  itemImage: string | null;
  quantity: number;
  reason: string;
  description: string | null;
  images: string[];
  status: ReturnStatus;
  sellerRemarks: string | null;
  refundAmount: number | null;
  customerName: string;
  createdAt: string;
}

export interface SeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface SellerAnalytics {
  range: { from: string; to: string };
  totals: {
    revenue: number;
    orders: number;
    unitsSold: number;
    averageOrderValue: number;
    views: number;
    conversionRate: number;
    returns: number;
  };
  series: SeriesPoint[];
  topProducts: Array<{
    productId: string;
    name: string;
    image: string | null;
    units: number;
    revenue: number;
  }>;
  statusBreakdown: Array<{ status: SubOrderStatus; count: number }>;
}

export interface PayoutDto {
  id: string;
  sellerId: string;
  sellerName?: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
  status: PayoutStatus;
  reference: string | null;
  notes: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface SellerBalance {
  pending: number;
  /** earned from delivered orders but still inside the return window */
  onHold: number;
  settled: number;
  lifetimeEarnings: number;
  commissionPaid: number;
}

export interface SellerReviewRow {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  title: string | null;
  body: string | null;
  customerName: string;
  sellerReply: string | null;
  createdAt: string;
}

export interface SellerQuestionRow {
  id: string;
  productId: string;
  productName: string;
  body: string;
  customerName: string;
  answered: boolean;
  createdAt: string;
}

// ───────────── Admin ─────────────

export interface AdminDashboard {
  range: { from: string; to: string };
  kpis: {
    gmv: number;
    orders: number;
    averageOrderValue: number;
    newUsers: number;
    activeSellers: number;
    pendingSellers: number;
    pendingProducts: number;
    openReturns: number;
    commissionEarned: number;
  };
  series: Array<{ date: string; gmv: number; orders: number; users: number }>;
  topCategories: Array<{ name: string; revenue: number }>;
  topSellers: Array<{ sellerId: string; storeName: string; revenue: number; orders: number }>;
  orderStatus: Array<{ status: OrderStatus; count: number }>;
}

export interface AdminSellerRow {
  id: string;
  userId: string;
  storeName: string;
  ownerName: string;
  email: string | null;
  status: SellerStatus;
  gstin: string | null;
  productCount: number;
  submittedAt: string | null;
  createdAt: string;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
  orderCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface AdminProductRow extends SellerProductRow {
  sellerName: string;
  brandName: string | null;
}

export interface AdminCouponDto {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export interface AdminBannerDto {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  linkUrl: string | null;
  ctaText: string | null;
  bgColor: string | null;
  placement: BannerPlacement;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface CommissionRuleDto {
  id: string;
  scope: CommissionScope;
  categoryId: string | null;
  categoryName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  rate: number;
  isActive: boolean;
}

export interface AuditLogDto {
  id: string;
  actor: { id: string; name: string; role: Role } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface ServiceablePincodeDto {
  id: string;
  pincode: string;
  city: string;
  state: string;
  deliveryDays: number;
  codAvailable: boolean;
  isActive: boolean;
}

export interface SiteSettings {
  deliveryFee: number;
  freeDeliveryThreshold: number;
  codEnabled: boolean;
  codMaxAmount: number;
  onlinePaymentsEnabled: boolean;
  supportEmail: string;
  supportPhone: string;
  defaultCommissionRate: number;
  payoutHoldDays: number;
  lowStockThreshold: number;
}

export interface AdminReturnRow extends SellerReturnRow {
  sellerName: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  adminRemarks: string | null;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  shippingAddress: ShippingAddressSnapshot | AddressDto;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  subOrders: Array<{
    id: string;
    subOrderNumber: string;
    status: SubOrderStatus;
    sellerName: string;
    items: OrderItemDto[];
    total: number;
    courier: string | null;
    trackingId: string | null;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    reason: string | null;
  }>;
  timeline: StatusHistoryDto[];
  createdAt: string;
}

export interface ModerationProduct extends ProductSummary {
  sellerName: string;
  description: string;
  images: ImageDto[];
  submittedAt: string;
}

export interface BroadcastAudience {
  customers: number;
  allUsers: number;
  /** users with at least one registered phone (push-capable) */
  pushDevices: number;
}

export interface BroadcastResult {
  recipients: number;
  pushUsers: number;
}
