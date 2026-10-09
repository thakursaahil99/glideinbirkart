import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ProductFacets } from '@gk/types';
import { hooks } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ProductCard } from '@/components/product';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ScreenHeader,
  Screen,
  Skeleton,
} from '@/components/ui';

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Customer rating' },
  { value: 'newest', label: 'Newest first' },
  { value: 'discount', label: 'Discount' },
] as const;

interface Filters {
  brand: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
}

const PRICE_BANDS = [
  { label: 'Under ₹500', min: undefined, max: 500 },
  { label: '₹500 - ₹1,000', min: 500, max: 1000 },
  { label: '₹1,000 - ₹5,000', min: 1000, max: 5000 },
  { label: '₹5,000 - ₹20,000', min: 5000, max: 20000 },
  { label: 'Over ₹20,000', min: 20000, max: undefined },
];

function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose} accessibilityLabel="Close" />
      <View
        className="max-h-[80%] rounded-t-3xl bg-background"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Text className="text-lg font-extrabold text-foreground">{title}</Text>
          <IconButton name="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerClassName="gap-5 p-4">{children}</ScrollView>
        {footer ? <View className="border-t border-border px-4 pt-3">{footer}</View> : null}
      </View>
    </Modal>
  );
}

function FilterSheet({
  visible,
  onClose,
  facets,
  value,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  facets?: ProductFacets;
  value: Filters;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);
  const toggleBrand = (slug: string) =>
    setDraft((d) => ({
      ...d,
      brand: d.brand.includes(slug) ? d.brand.filter((b) => b !== slug) : [...d.brand, slug],
    }));
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={
        <View className="flex-row gap-3">
          <Button
            title="Clear all"
            variant="outline"
            className="flex-1"
            onPress={() => {
              onApply({ brand: [] });
              onClose();
            }}
          />
          <Button
            title="Apply"
            className="flex-1"
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      }
    >
      <View className="gap-2">
        <Text className="font-bold text-foreground">Price</Text>
        <View className="flex-row flex-wrap gap-2">
          {PRICE_BANDS.map((b) => (
            <Chip
              key={b.label}
              label={b.label}
              selected={draft.minPrice === b.min && draft.maxPrice === b.max}
              onPress={() =>
                setDraft((d) =>
                  d.minPrice === b.min && d.maxPrice === b.max
                    ? { ...d, minPrice: undefined, maxPrice: undefined }
                    : { ...d, minPrice: b.min, maxPrice: b.max },
                )
              }
            />
          ))}
        </View>
        {facets && facets.priceRange.max > 0 ? (
          <Text className="text-xs text-muted-foreground">
            Prices here range {formatINR(facets.priceRange.min)} to{' '}
            {formatINR(facets.priceRange.max)}
          </Text>
        ) : null}
      </View>
      <View className="gap-2">
        <Text className="font-bold text-foreground">Customer rating</Text>
        <View className="flex-row gap-2">
          {[4, 3, 2].map((r) => (
            <Chip
              key={r}
              label={`${r}★ & up`}
              selected={draft.rating === r}
              onPress={() => setDraft((d) => ({ ...d, rating: d.rating === r ? undefined : r }))}
            />
          ))}
        </View>
      </View>
      {facets?.brands.length ? (
        <View className="gap-2">
          <Text className="font-bold text-foreground">Brand</Text>
          <View className="flex-row flex-wrap gap-2">
            {facets.brands.slice(0, 16).map((b) => (
              <Chip
                key={b.id}
                label={`${b.name} (${b.count})`}
                selected={draft.brand.includes(b.slug)}
                onPress={() => toggleBrand(b.slug)}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View className="gap-2">
        <Text className="font-bold text-foreground">Availability</Text>
        <Chip
          label="Exclude out of stock"
          selected={!!draft.inStock}
          onPress={() => setDraft((d) => ({ ...d, inStock: d.inStock ? undefined : true }))}
        />
      </View>
    </Sheet>
  );
}

export default function ProductListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    q?: string;
    category?: string;
    brand?: string;
    sort?: string;
  }>();
  const [sort, setSort] = useState<string>(params.sort ?? (params.q ? 'relevance' : 'popularity'));
  const [filters, setFilters] = useState<Filters>({ brand: params.brand ? [params.brand] : [] });
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const query = useMemo(
    () => ({
      q: params.q,
      category: params.category,
      brand: filters.brand.length ? filters.brand : undefined,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      rating: filters.rating,
      inStock: filters.inStock,
      sort: sort === 'relevance' && !params.q ? undefined : sort,
      limit: 20,
    }),
    [params.q, params.category, filters, sort],
  );
  const list = hooks.useInfiniteProducts(query);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const meta = list.data?.pages[0]?.meta;
  const activeFilters =
    filters.brand.length +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStock ? 1 : 0);
  const title = params.q ? `"${params.q}"` : (meta?.category?.name ?? 'All products');
  const cardW = (width - 44) / 2;

  return (
    <Screen>
      <ScreenHeader
        title={title}
        onBack={() => router.back()}
        right={<IconButton name="search" label="Search" onPress={() => router.push('/search')} />}
      />
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-2.5">
        <Chip
          label={SORTS.find((s) => s.value === sort)?.label ?? 'Sort'}
          icon="swap-vertical"
          onPress={() => setShowSort(true)}
        />
        <Chip
          label={activeFilters ? `Filters (${activeFilters})` : 'Filters'}
          icon="options-outline"
          selected={activeFilters > 0}
          onPress={() => setShowFilters(true)}
        />
        <Text className="ml-auto text-xs text-muted-foreground">
          {meta ? `${meta.total} items` : ''}
        </Text>
      </View>

      {meta?.didYouMean ? (
        <Pressable
          onPress={() => router.setParams({ q: meta.didYouMean as string })}
          className="bg-secondary px-4 py-2.5"
        >
          <Text className="text-sm text-secondary-foreground">
            Showing results for your search. Did you mean{' '}
            <Text className="font-bold">{meta.didYouMean}</Text>?
          </Text>
        </Pressable>
      ) : null}

      {list.isLoading ? (
        <View className="flex-row flex-wrap gap-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ width: cardW }} className="h-60" />
          ))}
        </View>
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon="search-outline"
          title="No products found"
          message={
            activeFilters
              ? 'Try removing a few filters.'
              : 'Try a different search or browse categories.'
          }
          action={activeFilters ? 'Clear filters' : 'Browse categories'}
          onAction={() => (activeFilters ? setFilters({ brand: [] }) : router.push('/categories'))}
        />
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(p) => p.id}
          columnWrapperClassName="gap-3 px-4"
          contentContainerClassName="gap-3 pb-8 pt-3"
          renderItem={({ item }) => <ProductCard product={item} width={cardW} />}
          onEndReachedThreshold={0.6}
          onEndReached={() =>
            list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()
          }
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => void list.refetch()}
          ListFooterComponent={
            list.isFetchingNextPage ? <ActivityIndicator className="py-4" /> : null
          }
        />
      )}

      <Sheet visible={showSort} onClose={() => setShowSort(false)} title="Sort by">
        {SORTS.filter((s) => params.q || s.value !== 'relevance').map((s) => (
          <Pressable
            key={s.value}
            onPress={() => {
              setSort(s.value);
              setShowSort(false);
            }}
            className="flex-row items-center justify-between py-2"
            accessibilityRole="radio"
            accessibilityState={{ selected: sort === s.value }}
          >
            <Text
              className={cn(
                'text-base',
                sort === s.value ? 'font-bold text-primary' : 'text-foreground',
              )}
            >
              {s.label}
            </Text>
            {sort === s.value ? <Icon name="checkmark" size={20} /> : null}
          </Pressable>
        ))}
      </Sheet>
      {showFilters ? (
        <FilterSheet
          visible
          onClose={() => setShowFilters(false)}
          facets={meta?.facets}
          value={filters}
          onApply={setFilters}
        />
      ) : null}
    </Screen>
  );
}
