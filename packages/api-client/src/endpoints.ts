import type {
  AddressDto,
  AdminBannerDto,
  AdminCouponDto,
  AdminDashboard,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProductRow,
  AdminReturnRow,
  AdminSellerRow,
  AdminUserRow,
  AttributeDto,
  AuditLogDto,
  AuthResult,
  BrandDto,
  BroadcastAudience,
  BroadcastResult,
  BulkUploadReport,
  CartDto,
  CategoryAttributeDto,
  CategoryDto,
  CheckoutResult,
  CmsPageDto,
  CommissionRuleDto,
  CouponDto,
  HomeData,
  InventoryRow,
  KycDocumentDto,
  NotificationDto,
  OrderDto,
  OrderSummaryDto,
  OtpRequestResult,
  PayoutDto,
  PincodeCheck,
  ProductDetail,
  ProductListMeta,
  ProductSummary,
  PublicSettings,
  QuestionDto,
  RatingBreakdown,
  ReturnRequestDto,
  ReviewDto,
  SearchSuggestions,
  SellerAnalytics,
  SellerBalance,
  SellerProductDto,
  SellerProductRow,
  SellerProfileDto,
  SellerQuestionRow,
  SellerReturnRow,
  SellerReviewRow,
  SellerSubOrderDetail,
  SellerSubOrderRow,
  ServiceablePincodeDto,
  SiteSettings,
  ThemeSettings,
  UploadResult,
  UserDto,
  WishlistItemDto,
} from '@gk/types';
import type {
  AddressOutput,
  AdminReturnDecisionInput,
  BannerOutput,
  BroadcastInput,
  CheckoutInput,
  CmsPageInput,
  CommissionRuleInput,
  CouponOutput,
  KycDocumentInput,
  LoginInput,
  ProductOutput,
  RegisterInput,
  ReturnRequestInput,
  ReviewInput,
  SellerBankInput,
  SellerBusinessInput,
  SellerPickupInput,
  SellerDecisionInput,
  ServiceablePincodeInput,
  ShipSubOrderInput,
  UpdateProfileInput,
  VerifyPaymentInput,
} from '@gk/validators';
import type { ApiClient, Query } from './client';

type Id = string;
type P = Query;

export interface ProductListParams extends P {
  q?: string;
  category?: string;
  brand?: string[] | string;
  seller?: string[] | string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  discount?: number;
  inStock?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Every REST endpoint as a typed function. Grouped by audience (customer / seller / admin). */
export function createApi(c: ApiClient) {
  const pg = <T, M = Record<string, unknown>>(
    path: string,
    q?: P,
    init?: RequestInit & Record<string, unknown>,
  ) => c.paged<T, M>(path, q, init);

  return {
    client: c,

    auth: {
      register: (body: RegisterInput) =>
        c.post<AuthResult>('/auth/register', body, { anonymous: true }),
      login: (body: LoginInput) => c.post<AuthResult>('/auth/login', body, { anonymous: true }),
      requestOtp: (phone: string) =>
        c.post<OtpRequestResult>('/auth/otp/request', { phone }, { anonymous: true }),
      verifyOtp: (body: { phone: string; code: string; name?: string }) =>
        c.post<AuthResult>('/auth/otp/verify', body, { anonymous: true }),
      refresh: () => c.post<AuthResult>('/auth/refresh', {}, { anonymous: true, noRefresh: true }),
      logout: (refreshToken?: string) =>
        c.post<{ loggedOut: boolean }>('/auth/logout', refreshToken ? { refreshToken } : {}, {
          anonymous: true,
          noRefresh: true,
        }),
      logoutAll: () => c.post<{ loggedOut: boolean }>('/auth/logout-all'),
      verifyEmail: (token: string) =>
        c.post<{ verified: boolean }>('/auth/verify-email', { token }, { anonymous: true }),
      resendVerification: () => c.post<{ sent: boolean }>('/auth/resend-verification'),
      forgotPassword: (email: string) =>
        c.post<{ sent: boolean }>('/auth/forgot-password', { email }, { anonymous: true }),
      resetPassword: (token: string, password: string) =>
        c.post<{ reset: boolean }>(
          '/auth/reset-password',
          { token, password },
          { anonymous: true },
        ),
      changePassword: (currentPassword: string, newPassword: string) =>
        c.post<{ changed: boolean }>('/auth/change-password', { currentPassword, newPassword }),
    },

    users: {
      me: () => c.get<UserDto>('/users/me'),
      update: (body: UpdateProfileInput) => c.patch<UserDto>('/users/me', body),
    },

    addresses: {
      list: () => c.get<AddressDto[]>('/addresses'),
      create: (body: AddressOutput) => c.post<AddressDto>('/addresses', body),
      update: (id: Id, body: AddressOutput) => c.put<AddressDto>(`/addresses/${id}`, body),
      setDefault: (id: Id) => c.patch<AddressDto>(`/addresses/${id}/default`),
      remove: (id: Id) => c.delete<{ id: string }>(`/addresses/${id}`),
    },

    catalog: {
      categories: (init?: RequestInit & Record<string, unknown>) =>
        c.get<CategoryDto[]>('/categories', undefined, init),
      categoriesFlat: () => c.get<CategoryDto[]>('/categories', { flat: true }),
      category: (slug: string, init?: RequestInit & Record<string, unknown>) =>
        c.get<CategoryDto & { breadcrumbs: Array<{ name: string; slug: string }> }>(
          `/categories/${slug}`,
          undefined,
          init,
        ),
      brands: (init?: RequestInit & Record<string, unknown>) =>
        c.get<BrandDto[]>('/brands', undefined, init),
      attributesForCategory: (categoryId: Id) =>
        c.get<CategoryAttributeDto[]>(`/catalog/categories/${categoryId}/attributes`),
    },

    home: (init?: RequestInit & Record<string, unknown>) =>
      c.get<HomeData>('/home', undefined, init),

    products: {
      list: (q: ProductListParams, init?: RequestInit & Record<string, unknown>) =>
        pg<ProductSummary, ProductListMeta>('/products', q, init),
      detail: (slug: string, init?: RequestInit & Record<string, unknown>) =>
        c.get<ProductDetail>(`/products/${slug}`, undefined, init),
      byIds: (ids: string[]) => c.get<ProductSummary[]>('/products/by-ids', { ids: ids.join(',') }),
      similar: (id: Id) => c.get<ProductSummary[]>(`/products/${id}/similar`),
      frequentlyBought: (id: Id) => c.get<ProductSummary[]>(`/products/${id}/frequently-bought`),
      recommended: (viewed?: string[], limit = 12) =>
        c.get<ProductSummary[]>('/products/recommended', { viewed, limit }),
      recentlyViewed: () => c.get<ProductSummary[]>('/products/recently-viewed'),
      trackView: (id: Id) => c.post<null>(`/products/${id}/view`),
      reviews: (
        id: Id,
        q: { page?: number; limit?: number; rating?: number; sort?: string; withImages?: boolean },
      ) => pg<ReviewDto, { breakdown: RatingBreakdown }>(`/products/${id}/reviews`, q),
      reviewEligibility: (id: Id) =>
        c.get<{
          canReview: boolean;
          hasReviewed: boolean;
          verifiedPurchase: boolean;
          orderItemId: string | null;
        }>(`/products/${id}/review-eligibility`),
      questions: (id: Id, q: { page?: number; limit?: number } = {}) =>
        pg<QuestionDto>(`/products/${id}/questions`, q),
    },

    search: {
      list: (q: ProductListParams) => pg<ProductSummary, ProductListMeta>('/search', q),
      suggest: (q: string) => c.get<SearchSuggestions>('/search/suggest', { q }),
      popular: () => c.get<string[]>('/search/popular'),
    },

    delivery: { check: (pincode: string) => c.get<PincodeCheck>('/delivery/check', { pincode }) },
    theme: {
      get: (init?: RequestInit & Record<string, unknown>) =>
        c.get<ThemeSettings>('/theme', undefined, init),
    },
    settings: {
      public: (init?: RequestInit & Record<string, unknown>) =>
        c.get<PublicSettings>('/settings/public', undefined, init),
    },
    cms: {
      list: () => c.get<Array<{ slug: string; title: string }>>('/cms'),
      page: (slug: string, init?: RequestInit & Record<string, unknown>) =>
        c.get<CmsPageDto>(`/cms/${slug}`, undefined, init),
    },

    cart: {
      get: () => c.get<CartDto>('/cart'),
      add: (variantId: Id, quantity = 1) => c.post<CartDto>('/cart/items', { variantId, quantity }),
      setQuantity: (variantId: Id, quantity: number) =>
        c.patch<CartDto>(`/cart/items/${variantId}`, { quantity }),
      remove: (variantId: Id) => c.delete<CartDto>(`/cart/items/${variantId}`),
      saveForLater: (variantId: Id) => c.post<CartDto>(`/cart/items/${variantId}/save-for-later`),
      moveToCart: (variantId: Id) => c.post<CartDto>(`/cart/items/${variantId}/move-to-cart`),
      clear: () => c.delete<CartDto>('/cart'),
      applyCoupon: (code: string) => c.post<CartDto>('/cart/coupon', { code }),
      removeCoupon: () => c.delete<CartDto>('/cart/coupon'),
      merge: (guestCartId: string) => c.post<CartDto>('/cart/merge', { guestCartId }),
    },

    coupons: { available: () => c.get<CouponDto[]>('/coupons/available') },

    wishlist: {
      list: (q: { page?: number; limit?: number } = {}) => pg<WishlistItemDto>('/wishlist', q),
      ids: () => c.get<string[]>('/wishlist/ids'),
      add: (productId: Id) => c.post<{ productId: string }>('/wishlist', { productId }),
      remove: (productId: Id) => c.delete<{ productId: string }>(`/wishlist/${productId}`),
    },

    orders: {
      checkout: (body: CheckoutInput) => c.post<CheckoutResult>('/checkout', body),
      list: (q: { page?: number; limit?: number; status?: string } = {}) =>
        pg<OrderSummaryDto>('/orders', q),
      get: (id: Id) => c.get<OrderDto>(`/orders/${id}`),
      cancel: (id: Id, reason: string) => c.post<OrderDto>(`/orders/${id}/cancel`, { reason }),
      invoice: (id: Id) => c.blob(`/orders/${id}/invoice`),
    },

    payments: {
      verify: (body: VerifyPaymentInput) => c.post<OrderDto>('/payments/verify', body),
      failed: (orderId: Id, reason?: string) =>
        c.post<{ recorded: boolean }>('/payments/failed', { orderId, reason }),
      retry: (orderId: Id) => c.post<CheckoutResult>(`/payments/orders/${orderId}/retry`),
      mockComplete: (orderId: Id, success: boolean) =>
        c.post<
          | {
              success: true;
              razorpayOrderId: string;
              razorpayPaymentId: string;
              razorpaySignature: string;
            }
          | { success: false }
        >('/payments/mock/complete', { orderId, success }),
    },

    returns: {
      request: (body: ReturnRequestInput) => c.post<ReturnRequestDto>('/returns', body),
      list: (q: { page?: number; limit?: number } = {}) => pg<ReturnRequestDto>('/returns', q),
      escalate: (id: Id, note?: string) =>
        c.post<ReturnRequestDto>(`/returns/${id}/escalate`, { note }),
    },

    reviews: {
      create: (body: ReviewInput) => c.post<ReviewDto>('/reviews', body),
      update: (id: Id, body: Partial<ReviewInput>) => c.put<ReviewDto>(`/reviews/${id}`, body),
      remove: (id: Id) => c.delete<{ id: string }>(`/reviews/${id}`),
      helpful: (id: Id) => c.post<{ helpfulCount: number }>(`/reviews/${id}/helpful`),
    },

    qna: {
      ask: (productId: Id, body: string) => c.post<QuestionDto>('/questions', { productId, body }),
      answer: (questionId: Id, body: string) =>
        c.post<QuestionDto>(`/questions/${questionId}/answers`, { body }),
    },

    notifications: {
      list: (q: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
        pg<NotificationDto, { unread: number }>('/notifications', q),
      unreadCount: () => c.get<{ count: number }>('/notifications/unread-count'),
      markRead: (id: Id) => c.patch<{ id: string }>(`/notifications/${id}/read`),
      readAll: () => c.post<{ updated: number }>('/notifications/read-all'),
      registerPushToken: (token: string, platform = 'expo') =>
        c.post<{ registered: boolean }>('/notifications/push-token', { token, platform }),
      removePushToken: (token: string) =>
        c.delete<{ removed: boolean }>(`/notifications/push-token/${encodeURIComponent(token)}`),
    },

    uploads: {
      upload: (file: Blob | { uri: string; name: string; type: string }, folder: string) => {
        const form = new FormData();
        form.append('file', file as Blob);
        form.append('folder', folder);
        return c.post<UploadResult>('/uploads', form);
      },
    },

    // ───────────────────────── seller ─────────────────────────
    seller: {
      apply: (body: SellerBusinessInput) => c.post<SellerProfileDto>('/sellers/apply', body),
      profile: () => c.get<SellerProfileDto>('/seller/profile'),
      saveBusiness: (body: SellerBusinessInput) =>
        c.put<SellerProfileDto>('/seller/profile/business', body),
      saveBank: (body: SellerBankInput) => c.put<SellerProfileDto>('/seller/profile/bank', body),
      savePickup: (body: SellerPickupInput) =>
        c.put<SellerProfileDto>('/seller/profile/pickup', body),
      updateSettings: (body: { description?: string; logoUrl?: string }) =>
        c.patch<SellerProfileDto>('/seller/settings', body),
      addKyc: (body: KycDocumentInput) => c.post<KycDocumentDto>('/seller/kyc', body),
      removeKyc: (id: Id) => c.delete<{ id: string }>(`/seller/kyc/${id}`),
      submit: () => c.post<SellerProfileDto>('/seller/submit'),

      products: {
        list: (q: { page?: number; limit?: number; q?: string; status?: string; sort?: string }) =>
          pg<SellerProductRow>('/seller/products', q),
        get: (id: Id) => c.get<SellerProductDto>(`/seller/products/${id}`),
        create: (body: ProductOutput | Record<string, unknown>) =>
          c.post<SellerProductDto>('/seller/products', body),
        update: (id: Id, body: ProductOutput | Record<string, unknown>) =>
          c.put<SellerProductDto>(`/seller/products/${id}`, body),
        setStatus: (id: Id, action: 'ARCHIVE' | 'UNARCHIVE' | 'SUBMIT') =>
          c.patch<SellerProductDto>(`/seller/products/${id}/status`, { action }),
        remove: (id: Id) => c.delete<{ id: string }>(`/seller/products/${id}`),
        bulkUpload: (file: Blob) => {
          const form = new FormData();
          form.append('file', file);
          return c.post<BulkUploadReport>('/seller/products/bulk', form);
        },
        template: () => c.blob('/seller/products/bulk/template'),
      },
      inventory: {
        list: (q: { page?: number; limit?: number; low?: boolean; q?: string }) =>
          pg<InventoryRow, { lowStockCount: number }>('/seller/inventory', q),
        update: (variantId: Id, body: { quantity: number; lowStockThreshold?: number }) =>
          c.patch<InventoryRow>(`/seller/inventory/${variantId}`, body),
      },
      orders: {
        list: (q: { page?: number; limit?: number; status?: string; q?: string }) =>
          pg<SellerSubOrderRow, { statusCounts: Record<string, number> }>('/seller/orders', q),
        get: (id: Id) => c.get<SellerSubOrderDetail>(`/seller/orders/${id}`),
        accept: (id: Id) => c.post<SellerSubOrderDetail>(`/seller/orders/${id}/accept`),
        pack: (id: Id) => c.post<SellerSubOrderDetail>(`/seller/orders/${id}/pack`),
        ship: (id: Id, body: ShipSubOrderInput) =>
          c.post<SellerSubOrderDetail>(`/seller/orders/${id}/ship`, body),
        deliver: (id: Id) => c.post<SellerSubOrderDetail>(`/seller/orders/${id}/deliver`),
        cancel: (id: Id, reason: string) =>
          c.post<SellerSubOrderDetail>(`/seller/orders/${id}/cancel`, { reason }),
        label: (id: Id) => c.blob(`/seller/orders/${id}/label`),
      },
      returns: {
        list: (q: { page?: number; limit?: number; status?: string }) =>
          pg<SellerReturnRow>('/seller/returns', q),
        decide: (id: Id, decision: 'APPROVE' | 'REJECT', remarks?: string) =>
          c.post<SellerReturnRow>(`/seller/returns/${id}/decision`, { decision, remarks }),
        received: (id: Id) => c.post<SellerReturnRow>(`/seller/returns/${id}/received`),
      },
      analytics: (q: { from?: string; to?: string }) =>
        c.get<SellerAnalytics>('/seller/analytics', q),
      payouts: {
        list: (q: { page?: number; limit?: number }) => pg<PayoutDto>('/seller/payouts', q),
        balance: () => c.get<SellerBalance>('/seller/payouts/balance'),
        items: (id: Id) =>
          c.get<
            Array<{
              subOrderNumber: string;
              deliveredAt: string | null;
              gross: number;
              commission: number;
              net: number;
            }>
          >(`/seller/payouts/${id}/items`),
      },
      reviews: {
        list: (q: { page?: number; limit?: number; unreplied?: boolean }) =>
          pg<SellerReviewRow>('/seller/reviews', q),
        reply: (id: Id, body: string) => c.post<ReviewDto>(`/seller/reviews/${id}/reply`, { body }),
      },
      questions: {
        list: (q: { page?: number; limit?: number; unanswered?: boolean }) =>
          pg<SellerQuestionRow>('/seller/questions', q),
      },
    },

    // ───────────────────────── admin ─────────────────────────
    admin: {
      dashboard: (q: { from?: string; to?: string }) =>
        c.get<AdminDashboard>('/admin/dashboard', q),
      users: {
        list: (q: P) => pg<AdminUserRow>('/admin/users', q),
        block: (id: Id, blocked: boolean, reason?: string) =>
          c.post<{ id: string; blocked: boolean }>(`/admin/users/${id}/block`, { blocked, reason }),
      },
      sellers: {
        list: (q: P) => pg<AdminSellerRow>('/admin/sellers', q),
        get: (id: Id) =>
          c.get<
            SellerProfileDto & {
              owner: { name: string; email: string | null; phone: string | null };
            }
          >(`/admin/sellers/${id}`),
        decide: (id: Id, body: SellerDecisionInput) =>
          c.post<SellerProfileDto>(`/admin/sellers/${id}/decision`, body),
        reviewKyc: (docId: Id, status: 'APPROVED' | 'REJECTED', remarks?: string) =>
          c.post<KycDocumentDto>(`/admin/sellers/kyc/${docId}/review`, { status, remarks }),
      },
      products: {
        list: (q: P) => pg<AdminProductRow>('/admin/products', q),
        get: (id: Id) =>
          c.get<SellerProductDto & { sellerName: string; sellerId: string }>(
            `/admin/products/${id}`,
          ),
        approve: (id: Id) =>
          c.post<{ id: string; status: string }>(`/admin/products/${id}/approve`),
        reject: (id: Id, reason: string) =>
          c.post<{ id: string; status: string }>(`/admin/products/${id}/reject`, { reason }),
      },
      categories: {
        tree: () => c.get<CategoryDto[]>('/admin/categories'),
        create: (body: {
          name: string;
          parentId?: string | null;
          description?: string;
          imageUrl?: string;
          isActive?: boolean;
        }) => c.post<CategoryDto>('/admin/categories', body),
        update: (id: Id, body: Record<string, unknown>) =>
          c.patch<CategoryDto>(`/admin/categories/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/categories/${id}`),
        reorder: (nodes: Array<{ id: string; parentId: string | null; sortOrder: number }>) =>
          c.put<CategoryDto[]>('/admin/categories/reorder', { nodes }),
        attributes: (id: Id) => c.get<CategoryAttributeDto[]>(`/admin/categories/${id}/attributes`),
        setAttributes: (
          id: Id,
          attributes: Array<{ attributeId: string; isRequired: boolean; isVariantAxis: boolean }>,
        ) => c.put<CategoryAttributeDto[]>(`/admin/categories/${id}/attributes`, { attributes }),
      },
      brands: {
        list: () => c.get<BrandDto[]>('/admin/brands'),
        create: (body: {
          name: string;
          logoUrl?: string;
          description?: string;
          isActive?: boolean;
        }) => c.post<BrandDto>('/admin/brands', body),
        update: (id: Id, body: Record<string, unknown>) =>
          c.patch<BrandDto>(`/admin/brands/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/brands/${id}`),
      },
      attributes: {
        list: () => c.get<AttributeDto[]>('/admin/attributes'),
        create: (body: {
          name: string;
          type: string;
          unit?: string;
          isFilterable?: boolean;
          values?: Array<{ value: string; hex?: string }>;
        }) => c.post<AttributeDto>('/admin/attributes', body),
        update: (id: Id, body: Record<string, unknown>) =>
          c.patch<AttributeDto>(`/admin/attributes/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/attributes/${id}`),
      },
      banners: {
        list: () => c.get<AdminBannerDto[]>('/admin/banners'),
        create: (body: BannerOutput | Record<string, unknown>) =>
          c.post<AdminBannerDto>('/admin/banners', body),
        update: (id: Id, body: BannerOutput | Record<string, unknown>) =>
          c.put<AdminBannerDto>(`/admin/banners/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/banners/${id}`),
      },
      coupons: {
        list: (q: P) => pg<AdminCouponDto>('/admin/coupons', q),
        create: (body: CouponOutput | Record<string, unknown>) =>
          c.post<AdminCouponDto>('/admin/coupons', body),
        update: (id: Id, body: CouponOutput | Record<string, unknown>) =>
          c.put<AdminCouponDto>(`/admin/coupons/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/coupons/${id}`),
      },
      orders: {
        list: (q: P) => pg<AdminOrderRow>('/admin/orders', q),
        get: (id: Id) => c.get<AdminOrderDetail>(`/admin/orders/${id}`),
        cancel: (id: Id, reason: string) =>
          c.post<AdminOrderDetail>(`/admin/orders/${id}/cancel`, { reason }),
        refund: (id: Id, amount: number, reason: string) =>
          c.post<AdminOrderDetail>(`/admin/orders/${id}/refund`, { amount, reason }),
        invoice: (id: Id) => c.blob(`/admin/orders/${id}/invoice`),
      },
      returns: {
        list: (q: P) => pg<AdminReturnRow>('/admin/returns', q),
        decide: (id: Id, body: AdminReturnDecisionInput) =>
          c.post<ReturnRequestDto>(`/admin/returns/${id}/decision`, body),
      },
      payouts: {
        list: (q: P) => pg<PayoutDto>('/admin/payouts', q),
        eligible: () =>
          c.get<
            Array<{
              sellerId: string;
              storeName: string;
              orders: number;
              gross: number;
              commission: number;
              net: number;
              bankReady: boolean;
            }>
          >('/admin/payouts/eligible'),
        generate: (sellerId?: string) =>
          c.post<{ created: number; total: number }>('/admin/payouts/generate', { sellerId }),
        settle: (id: Id, reference: string, notes?: string) =>
          c.post<PayoutDto>(`/admin/payouts/${id}/settle`, { reference, notes }),
      },
      commission: {
        list: () => c.get<CommissionRuleDto[]>('/admin/commission-rules'),
        save: (body: CommissionRuleInput) =>
          c.post<CommissionRuleDto>('/admin/commission-rules', body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/commission-rules/${id}`),
      },
      cms: {
        list: () => c.get<CmsPageDto[]>('/admin/cms'),
        create: (body: CmsPageInput) => c.post<CmsPageDto>('/admin/cms', body),
        update: (id: Id, body: Partial<CmsPageInput>) =>
          c.patch<CmsPageDto>(`/admin/cms/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/cms/${id}`),
      },
      notifications: {
        audience: () => c.get<BroadcastAudience>('/admin/notifications/audience'),
        broadcast: (body: BroadcastInput) =>
          c.post<BroadcastResult>('/admin/notifications/broadcast', body),
      },
      auditLogs: (q: P) => pg<AuditLogDto>('/admin/audit-logs', q),
      theme: {
        get: () => c.get<ThemeSettings>('/admin/theme'),
        update: (body: ThemeSettings) => c.put<ThemeSettings>('/admin/theme', body),
        reset: () => c.post<ThemeSettings>('/admin/theme/reset'),
      },
      settings: {
        get: () => c.get<SiteSettings>('/admin/settings'),
        update: (body: SiteSettings) => c.put<SiteSettings>('/admin/settings', body),
      },
      pincodes: {
        list: (q: P) => pg<ServiceablePincodeDto>('/admin/pincodes', q),
        create: (body: ServiceablePincodeInput) =>
          c.post<ServiceablePincodeDto>('/admin/pincodes', body),
        update: (id: Id, body: ServiceablePincodeInput) =>
          c.post<ServiceablePincodeDto>(`/admin/pincodes/${id}`, body),
        remove: (id: Id) => c.delete<{ id: string }>(`/admin/pincodes/${id}`),
      },
      reviews: {
        setHidden: (id: Id, hidden: boolean) =>
          c.patch<{ id: string; hidden: boolean }>(`/admin/reviews/${id}/visibility`, { hidden }),
      },
    },
  };
}

export type Api = ReturnType<typeof createApi>;
