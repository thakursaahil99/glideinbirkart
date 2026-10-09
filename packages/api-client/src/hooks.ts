import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { CartDto, WishlistItemDto } from '@gk/types';
import type { AddressOutput, CheckoutInput, ReviewInput, UpdateProfileInput } from '@gk/validators';
import type { Api, ProductListParams } from './endpoints';

type Opts = { enabled?: boolean };

/** Query-key factory — shared by web and mobile so invalidation is consistent. */
export const qk = {
  home: ['home'] as const,
  categories: ['categories'] as const,
  brands: ['brands'] as const,
  settings: ['settings'] as const,
  theme: ['theme'] as const,
  coupons: ['coupons'] as const,
  me: ['me'] as const,
  products: (q: unknown) => ['products', q] as const,
  product: (slug: string) => ['product', slug] as const,
  similar: (id: string) => ['similar', id] as const,
  fbt: (id: string) => ['fbt', id] as const,
  recommended: (viewed?: string[]) => ['recommended', viewed ?? []] as const,
  recentlyViewed: ['recently-viewed'] as const,
  reviews: (id: string, q: unknown) => ['reviews', id, q] as const,
  reviewEligibility: (id: string) => ['review-eligibility', id] as const,
  questions: (id: string, q: unknown) => ['questions', id, q] as const,
  suggest: (q: string) => ['suggest', q] as const,
  popular: ['popular-searches'] as const,
  pincode: (p: string) => ['pincode', p] as const,
  cart: ['cart'] as const,
  wishlist: (q?: unknown) => ['wishlist', q ?? {}] as const,
  wishlistIds: ['wishlist-ids'] as const,
  addresses: ['addresses'] as const,
  orders: (q?: unknown) => ['orders', q ?? {}] as const,
  order: (id: string) => ['order', id] as const,
  returns: (q?: unknown) => ['returns', q ?? {}] as const,
  notifications: (q?: unknown) => ['notifications', q ?? {}] as const,
  unread: ['notifications-unread'] as const,
};

export function createHooks(api: Api) {
  // ───────── catalog ─────────
  const useHome = (o?: Opts) =>
    useQuery({ queryKey: qk.home, queryFn: () => api.home(), staleTime: 120_000, ...o });
  const useCategories = () =>
    useQuery({
      queryKey: qk.categories,
      queryFn: () => api.catalog.categories(),
      staleTime: 10 * 60_000,
    });
  const useBrands = () =>
    useQuery({ queryKey: qk.brands, queryFn: () => api.catalog.brands(), staleTime: 10 * 60_000 });
  const useSettings = () =>
    useQuery({
      queryKey: qk.settings,
      queryFn: () => api.settings.public(),
      staleTime: 5 * 60_000,
    });
  const useTheme = () =>
    useQuery({ queryKey: qk.theme, queryFn: () => api.theme.get(), staleTime: 2 * 60_000 });
  const useCoupons = () =>
    useQuery({ queryKey: qk.coupons, queryFn: () => api.coupons.available(), staleTime: 60_000 });

  const useProducts = (q: ProductListParams, o?: Opts) =>
    useQuery({
      queryKey: qk.products(q),
      queryFn: () => (q.q ? api.search.list(q) : api.products.list(q)),
      placeholderData: keepPreviousData,
      ...o,
    });

  /** Infinite scroll (mobile). Pages are 1-based; stops when `hasNext` is false. */
  const useInfiniteProducts = (q: Omit<ProductListParams, 'page'>) =>
    useInfiniteQuery({
      queryKey: ['products-infinite', q],
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        q.q
          ? api.search.list({ ...q, page: pageParam })
          : api.products.list({ ...q, page: pageParam }),
      getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    });

  const useProduct = (slug: string, o?: Opts) =>
    useQuery({
      queryKey: qk.product(slug),
      queryFn: () => api.products.detail(slug),
      staleTime: 60_000,
      ...o,
    });
  const useSimilar = (id?: string) =>
    useQuery({
      queryKey: qk.similar(id ?? ''),
      queryFn: () => api.products.similar(id as string),
      enabled: !!id,
      staleTime: 300_000,
    });
  const useFrequentlyBought = (id?: string) =>
    useQuery({
      queryKey: qk.fbt(id ?? ''),
      queryFn: () => api.products.frequentlyBought(id as string),
      enabled: !!id,
      staleTime: 300_000,
    });
  const useRecommended = (viewed?: string[], o?: Opts) =>
    useQuery({
      queryKey: qk.recommended(viewed),
      queryFn: () => api.products.recommended(viewed),
      staleTime: 120_000,
      ...o,
    });
  const useRecentlyViewed = (o?: Opts) =>
    useQuery({ queryKey: qk.recentlyViewed, queryFn: () => api.products.recentlyViewed(), ...o });
  const useReviews = (
    id: string,
    q: { page?: number; limit?: number; rating?: number; sort?: string; withImages?: boolean },
  ) =>
    useQuery({
      queryKey: qk.reviews(id, q),
      queryFn: () => api.products.reviews(id, q),
      placeholderData: keepPreviousData,
    });
  const useReviewEligibility = (id: string, o?: Opts) =>
    useQuery({
      queryKey: qk.reviewEligibility(id),
      queryFn: () => api.products.reviewEligibility(id),
      ...o,
    });
  const useQuestions = (id: string, q: { page?: number; limit?: number } = {}) =>
    useQuery({
      queryKey: qk.questions(id, q),
      queryFn: () => api.products.questions(id, q),
      placeholderData: keepPreviousData,
    });
  const useSuggest = (q: string) =>
    useQuery({
      queryKey: qk.suggest(q),
      queryFn: () => api.search.suggest(q),
      enabled: q.trim().length >= 2,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    });
  const usePopularSearches = () =>
    useQuery({ queryKey: qk.popular, queryFn: () => api.search.popular(), staleTime: 300_000 });
  const usePincode = (pincode: string) =>
    useQuery({
      queryKey: qk.pincode(pincode),
      queryFn: () => api.delivery.check(pincode),
      enabled: /^[1-9][0-9]{5}$/.test(pincode),
      staleTime: 300_000,
    });

  // ───────── cart ─────────
  const setCart = (qc: QueryClient) => (cart: CartDto) => qc.setQueryData(qk.cart, cart);
  const useCart = (o?: Opts) =>
    useQuery({ queryKey: qk.cart, queryFn: () => api.cart.get(), ...o });
  const useAddToCart = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (v: { variantId: string; quantity?: number }) =>
        api.cart.add(v.variantId, v.quantity ?? 1),
      onSuccess: setCart(qc),
    });
  };
  const useSetCartQuantity = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (v: { variantId: string; quantity: number }) =>
        api.cart.setQuantity(v.variantId, v.quantity),
      // optimistic: bump the line instantly, then settle with the server's recalculated totals
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: qk.cart });
        const prev = qc.getQueryData<CartDto>(qk.cart);
        if (prev)
          qc.setQueryData<CartDto>(qk.cart, {
            ...prev,
            items: prev.items.map((i) =>
              i.variantId === v.variantId ? { ...i, quantity: v.quantity } : i,
            ),
          });
        return { prev };
      },
      onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.cart, ctx.prev),
      onSuccess: setCart(qc),
    });
  };
  const useRemoveFromCart = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (variantId: string) => api.cart.remove(variantId),
      onSuccess: setCart(qc),
    });
  };
  const useSaveForLater = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (variantId: string) => api.cart.saveForLater(variantId),
      onSuccess: setCart(qc),
    });
  };
  const useMoveToCart = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (variantId: string) => api.cart.moveToCart(variantId),
      onSuccess: setCart(qc),
    });
  };
  const useApplyCoupon = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (code: string) => api.cart.applyCoupon(code),
      onSuccess: setCart(qc),
    });
  };
  const useRemoveCoupon = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: () => api.cart.removeCoupon(), onSuccess: setCart(qc) });
  };

  // ───────── wishlist ─────────
  const useWishlist = (q: { page?: number; limit?: number } = {}, o?: Opts) =>
    useQuery({
      queryKey: qk.wishlist(q),
      queryFn: () => api.wishlist.list(q),
      placeholderData: keepPreviousData,
      ...o,
    });
  const useWishlistIds = (o?: Opts) =>
    useQuery({
      queryKey: qk.wishlistIds,
      queryFn: () => api.wishlist.ids(),
      staleTime: 60_000,
      ...o,
    });
  const useToggleWishlist = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (v: { productId: string; active: boolean }) =>
        v.active ? api.wishlist.remove(v.productId) : api.wishlist.add(v.productId),
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: qk.wishlistIds });
        const prev = qc.getQueryData<string[]>(qk.wishlistIds) ?? [];
        qc.setQueryData<string[]>(
          qk.wishlistIds,
          v.active ? prev.filter((id) => id !== v.productId) : [...prev, v.productId],
        );
        return { prev };
      },
      onError: (_e, _v, ctx) => ctx && qc.setQueryData(qk.wishlistIds, ctx.prev),
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: ['wishlist'] });
        void qc.invalidateQueries({ queryKey: qk.wishlistIds });
      },
    });
  };

  // ───────── account ─────────
  const useMe = (o?: Opts) => useQuery({ queryKey: qk.me, queryFn: () => api.users.me(), ...o });
  const useUpdateProfile = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (b: UpdateProfileInput) => api.users.update(b),
      onSuccess: (u) => qc.setQueryData(qk.me, u),
    });
  };
  const useAddresses = (o?: Opts) =>
    useQuery({ queryKey: qk.addresses, queryFn: () => api.addresses.list(), ...o });
  const useSaveAddress = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (v: { id?: string; body: AddressOutput }) =>
        v.id ? api.addresses.update(v.id, v.body) : api.addresses.create(v.body),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
    });
  };
  const useSetDefaultAddress = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.addresses.setDefault(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
    });
  };
  const useDeleteAddress = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.addresses.remove(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
    });
  };

  // ───────── orders ─────────
  const useOrders = (q: { page?: number; limit?: number; status?: string } = {}, o?: Opts) =>
    useQuery({
      queryKey: qk.orders(q),
      queryFn: () => api.orders.list(q),
      placeholderData: keepPreviousData,
      ...o,
    });
  const useOrdersInfinite = (q: { status?: string } = {}) =>
    useInfiniteQuery({
      queryKey: ['orders-infinite', q],
      initialPageParam: 1,
      queryFn: ({ pageParam }) => api.orders.list({ ...q, page: pageParam, limit: 10 }),
      getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    });
  const useOrder = (id: string, o?: Opts) =>
    useQuery({ queryKey: qk.order(id), queryFn: () => api.orders.get(id), ...o });
  const useCheckout = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (b: CheckoutInput) => api.orders.checkout(b),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.cart }),
    });
  };
  const useCancelOrder = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (v: { id: string; reason: string }) => api.orders.cancel(v.id, v.reason),
      onSuccess: (order) => {
        qc.setQueryData(qk.order(order.id), order);
        void qc.invalidateQueries({ queryKey: ['orders'] });
      },
    });
  };
  const useReturns = (q: { page?: number; limit?: number } = {}, o?: Opts) =>
    useQuery({ queryKey: qk.returns(q), queryFn: () => api.returns.list(q), ...o });
  const useCreateReview = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (b: ReviewInput) => api.reviews.create(b),
      onSuccess: (_r, b) => {
        void qc.invalidateQueries({ queryKey: ['reviews', b.productId] });
        void qc.invalidateQueries({ queryKey: qk.reviewEligibility(b.productId) });
        void qc.invalidateQueries({ queryKey: ['order'] });
      },
    });
  };
  const useRequestReturn = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (b: Parameters<Api['returns']['request']>[0]) => api.returns.request(b),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['returns'] });
        void qc.invalidateQueries({ queryKey: ['order'] });
      },
    });
  };

  // ───────── notifications ─────────
  const useNotifications = (q: { page?: number; limit?: number } = {}, o?: Opts) =>
    useQuery({
      queryKey: qk.notifications(q),
      queryFn: () => api.notifications.list(q),
      placeholderData: keepPreviousData,
      ...o,
    });
  const useUnreadCount = (o?: Opts) =>
    useQuery({
      queryKey: qk.unread,
      queryFn: () => api.notifications.unreadCount(),
      refetchInterval: 60_000,
      ...o,
    });
  const useMarkNotificationRead = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.notifications.markRead(id),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        void qc.invalidateQueries({ queryKey: qk.unread });
      },
    });
  };
  const useMarkAllRead = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: () => api.notifications.readAll(),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        void qc.invalidateQueries({ queryKey: qk.unread });
      },
    });
  };

  return {
    useHome,
    useCategories,
    useBrands,
    useSettings,
    useTheme,
    useCoupons,
    useProducts,
    useInfiniteProducts,
    useProduct,
    useSimilar,
    useFrequentlyBought,
    useRecommended,
    useRecentlyViewed,
    useReviews,
    useReviewEligibility,
    useQuestions,
    useSuggest,
    usePopularSearches,
    usePincode,
    useCart,
    useAddToCart,
    useSetCartQuantity,
    useRemoveFromCart,
    useSaveForLater,
    useMoveToCart,
    useApplyCoupon,
    useRemoveCoupon,
    useWishlist,
    useWishlistIds,
    useToggleWishlist,
    useMe,
    useUpdateProfile,
    useAddresses,
    useSaveAddress,
    useSetDefaultAddress,
    useDeleteAddress,
    useOrders,
    useOrdersInfinite,
    useOrder,
    useCheckout,
    useCancelOrder,
    useReturns,
    useCreateReview,
    useRequestReturn,
    useNotifications,
    useUnreadCount,
    useMarkNotificationRead,
    useMarkAllRead,
  };
}

export type Hooks = ReturnType<typeof createHooks>;
export type { WishlistItemDto };
