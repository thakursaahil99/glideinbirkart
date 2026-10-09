import type {
  AddressType,
  AttributeType,
  BannerPlacement,
  CouponType,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ReturnStatus,
  Role,
  SellerStatus,
  SubOrderStatus,
} from './enums';

/** All money values are plain numbers in INR (rupees, up to 2 decimals). Dates are ISO strings. */

// ───────────── Auth & user ─────────────

export interface UserDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  sellerStatus?: SellerStatus | null;
}

export interface AuthResult {
  accessToken: string;
  /** seconds until the access token expires */
  expiresIn: number;
  /** Only returned to mobile clients (web gets an httpOnly cookie). */
  refreshToken?: string;
  user: UserDto;
}

export interface OtpRequestResult {
  sent: boolean;
  /** seconds before another OTP may be requested */
  resendIn: number;
  /** Only present outside production, so demos work without an SMS gateway. */
  devOtp?: string;
}

export interface AddressDto {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type: AddressType;
  isDefault: boolean;
}

// ───────────── Catalog ─────────────

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  depth: number;
  description?: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  children?: CategoryDto[];
}

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description?: string | null;
  isActive?: boolean;
  productCount?: number;
}

export interface AttributeValueDto {
  id: string;
  value: string;
  hex: string | null;
}

export interface AttributeDto {
  id: string;
  name: string;
  slug: string;
  type: AttributeType;
  unit: string | null;
  isFilterable: boolean;
  values: AttributeValueDto[];
}

export interface CategoryAttributeDto extends AttributeDto {
  isRequired: boolean;
  isVariantAxis: boolean;
}

export interface ImageDto {
  id: string;
  url: string;
  alt: string | null;
  position: number;
  variantId?: string | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string };
  seller: { id: string; storeName: string; slug: string };
  image: string | null;
  /** Price of the cheapest variant. */
  price: number;
  mrp: number;
  discountPercent: number;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
  /** Set when the cheapest variant is nearly sold out. */
  lowStock: boolean;
  soldCount: number;
  defaultVariantId: string | null;
  hasVariants: boolean;
  createdAt: string;
}

export interface VariantDto {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  mrp: number;
  price: number;
  discountPercent: number;
  /** Units that can currently be bought (on hand − reserved). */
  stock: number;
  inStock: boolean;
  isDefault: boolean;
  imageIds: string[];
}

export interface ProductOption {
  /** attribute slug e.g. "color" */
  key: string;
  label: string;
  type: AttributeType;
  values: Array<{ value: string; hex?: string | null }>;
}

export interface BreadcrumbItem {
  name: string;
  slug: string;
}

export interface RatingBreakdown {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  highlights: string[];
  specifications: Array<{ key: string; value: string }>;
  images: ImageDto[];
  variants: VariantDto[];
  options: ProductOption[];
  breadcrumbs: BreadcrumbItem[];
  gstRate: number;
  hsnCode: string | null;
  isReturnable: boolean;
  returnWindowDays: number;
  ratingBreakdown: RatingBreakdown;
  seoTitle: string | null;
  seoDescription: string | null;
  sellerInfo: {
    id: string;
    storeName: string;
    slug: string;
    ratingAvg: number;
    ratingCount: number;
    since: string;
  };
  status: ProductStatus;
}

export interface ProductFacets {
  brands: Array<{ id: string; name: string; slug: string; count: number }>;
  categories: Array<{ id: string; name: string; slug: string; count: number }>;
  sellers: Array<{ id: string; storeName: string; count: number }>;
  priceRange: { min: number; max: number };
  attributes: Array<{
    key: string;
    label: string;
    type: AttributeType;
    values: Array<{ value: string; hex?: string | null; count: number }>;
  }>;
}

export interface ProductListMeta {
  facets?: ProductFacets;
  /** Corrected spelling when the search had a typo. */
  didYouMean?: string | null;
  category?: CategoryDto & { breadcrumbs: BreadcrumbItem[] };
  query?: string;
}

export interface SearchSuggestions {
  products: Array<{
    id: string;
    slug: string;
    name: string;
    image: string | null;
    price: number;
    category: string;
  }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  brands: Array<{ id: string; slug: string; name: string }>;
  queries: string[];
}

export interface BannerDto {
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
}

export interface HomeData {
  banners: BannerDto[];
  secondaryBanners: BannerDto[];
  categories: CategoryDto[];
  deals: { endsAt: string; products: ProductSummary[] };
  trending: ProductSummary[];
  bestSellers: ProductSummary[];
  newArrivals: ProductSummary[];
  topRated: ProductSummary[];
  featured: Array<{ category: CategoryDto; products: ProductSummary[] }>;
}

export interface PincodeCheck {
  pincode: string;
  serviceable: boolean;
  city?: string;
  state?: string;
  deliveryDays?: number;
  /** ISO date of the estimated delivery */
  eta?: string;
  codAvailable?: boolean;
  message: string;
}

// ───────────── Reviews & Q&A ─────────────

export interface ReviewDto {
  id: string;
  productId: string;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  user: { id: string; name: string; avatarUrl: string | null };
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
}

export interface AnswerDto {
  id: string;
  body: string;
  isSeller: boolean;
  user: { id: string; name: string };
  createdAt: string;
}

export interface QuestionDto {
  id: string;
  productId: string;
  body: string;
  user: { id: string; name: string };
  answers: AnswerDto[];
  createdAt: string;
}

// ───────────── Cart ─────────────

export interface PricingBreakdown {
  mrpTotal: number;
  productDiscount: number;
  subtotal: number;
  couponDiscount: number;
  deliveryFee: number;
  /** GST contained in the total (prices are GST-inclusive). */
  gstTotal: number;
  total: number;
  savings: number;
  freeDeliveryThreshold: number;
  amountForFreeDelivery: number;
}

export interface CartItemDto {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string | null;
  image: string | null;
  quantity: number;
  mrp: number;
  price: number;
  discountPercent: number;
  gstRate: number;
  /** Units available right now */
  stock: number;
  maxQuantity: number;
  seller: { id: string; storeName: string };
  savedForLater: boolean;
  /** Present when the line cannot be bought as-is (out of stock, price changed, unavailable). */
  issue: string | null;
}

export interface AppliedCoupon {
  code: string;
  discount: number;
  description: string | null;
}

export interface CartDto {
  items: CartItemDto[];
  saved: CartItemDto[];
  itemCount: number;
  coupon: AppliedCoupon | null;
  /** Reason a previously applied coupon was dropped */
  couponMessage: string | null;
  pricing: PricingBreakdown;
}

export interface CouponDto {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  expiresAt: string | null;
}

// ───────────── Orders ─────────────

export interface ShippingAddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  variantName: string | null;
  image: string | null;
  quantity: number;
  mrp: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  gstAmount: number;
  lineTotal: number;
  returnedQty: number;
  canReturn: boolean;
  canReview: boolean;
  reviewed: boolean;
  returnRequest: { id: string; status: ReturnStatus } | null;
}

export interface StatusHistoryDto {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  subOrderId: string | null;
}

export interface SubOrderDto {
  id: string;
  subOrderNumber: string;
  status: SubOrderStatus;
  seller: { id: string; storeName: string };
  items: OrderItemDto[];
  subtotal: number;
  total: number;
  courier: string | null;
  trackingId: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface PaymentDto {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  providerOrderId: string | null;
  paidAt: string | null;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  pricing: PricingBreakdown;
  couponCode: string | null;
  shippingAddress: ShippingAddressSnapshot;
  subOrders: SubOrderDto[];
  timeline: StatusHistoryDto[];
  payment: PaymentDto | null;
  canCancel: boolean;
  hasInvoice: boolean;
  invoiceNumber: string | null;
  expiresAt: string | null;
  placedAt: string | null;
  createdAt: string;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  itemCount: number;
  previewImages: string[];
  firstItemName: string;
  createdAt: string;
}

/** Returned by POST /checkout. For Razorpay the client opens the checkout widget with `razorpay`. */
export interface CheckoutResult {
  order: OrderDto;
  razorpay?: {
    keyId: string;
    orderId: string;
    /** paise */
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill: { name: string; email: string; contact: string };
    /** true when the server runs the built-in mock gateway (no real Razorpay keys configured) */
    mock: boolean;
  };
}

export interface ReturnRequestDto {
  id: string;
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  itemName: string;
  itemImage: string | null;
  quantity: number;
  reason: string;
  description: string | null;
  images: string[];
  status: ReturnStatus;
  sellerRemarks: string | null;
  adminRemarks: string | null;
  refundAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface WishlistItemDto {
  id: string;
  addedAt: string;
  product: ProductSummary;
}

export interface CmsPageDto {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  updatedAt: string;
}

export interface PublicSettings {
  deliveryFee: number;
  freeDeliveryThreshold: number;
  codEnabled: boolean;
  codMaxAmount: number;
  /** false = cash-only store: checkout offers Cash on Delivery and the API rejects online payments. */
  onlinePaymentsEnabled: boolean;
  supportEmail: string;
  supportPhone: string;
  razorpayKeyId: string | null;
  currency: 'INR';
}

export interface UploadSignature {
  provider: 'cloudinary' | 'local';
  /** Cloudinary: signed upload params. Local: POST the file to `uploadUrl`. */
  uploadUrl: string;
  params?: Record<string, string | number>;
}

export interface UploadResult {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
  bytes?: number;
}
