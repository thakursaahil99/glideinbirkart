import { memo } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { ProductSummary } from '@gk/types';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatINR, imageUrl } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { Badge, Icon, RatingPill, SectionHeader } from './ui';

export function Price({
  price,
  mrp,
  discount,
  size = 'md',
}: {
  price: number;
  mrp?: number;
  discount?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-1.5">
      <Text
        className={cn(
          'font-extrabold text-foreground',
          size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base',
        )}
      >
        {formatINR(price)}
      </Text>
      {mrp && mrp > price ? (
        <Text
          className={cn(
            'text-muted-foreground line-through',
            size === 'lg' ? 'text-sm' : 'text-xs',
          )}
        >
          {formatINR(mrp)}
        </Text>
      ) : null}
      {discount ? (
        <Text className={cn('font-bold text-success', size === 'lg' ? 'text-sm' : 'text-xs')}>
          {discount}% off
        </Text>
      ) : null}
    </View>
  );
}

export function WishlistHeart({ productId, className }: { productId: string; className?: string }) {
  const router = useRouter();
  const authed = useAuth((s) => s.status === 'authed');
  const ids = hooks.useWishlistIds({ enabled: authed });
  const toggle = hooks.useToggleWishlist();
  const c = useColors();
  const active = !!ids.data?.includes(productId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from wishlist' : 'Add to wishlist'}
      hitSlop={8}
      className={cn('size-9 items-center justify-center rounded-full bg-card/90', className)}
      onPress={() => {
        if (!authed) return router.push('/auth/login');
        void Haptics.selectionAsync();
        toggle.mutate({ productId, active });
      }}
    >
      <Icon
        name={active ? 'heart' : 'heart-outline'}
        size={20}
        color={active ? c.deal : c.foreground}
      />
    </Pressable>
  );
}

export const ProductCard = memo(function ProductCard({
  product,
  width,
  className,
}: {
  product: ProductSummary;
  width?: number;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${product.name}, ${formatINR(product.price)}`}
      onPress={() => router.push({ pathname: '/products/[slug]', params: { slug: product.slug } })}
      style={width ? { width } : undefined}
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card active:opacity-90',
        className,
      )}
    >
      <View className="aspect-square bg-muted">
        <Image
          source={{ uri: imageUrl(product.image) }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
        {product.discountPercent >= 5 ? (
          <View className="absolute left-2 top-2">
            <Badge tone="deal">{product.discountPercent}% OFF</Badge>
          </View>
        ) : null}
        <WishlistHeart productId={product.id} className="absolute right-2 top-2" />
        {!product.inStock ? (
          <View className="absolute inset-0 items-center justify-center bg-background/70">
            <Text className="text-sm font-bold text-muted-foreground">Out of stock</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-1 p-2.5">
        {product.brand ? (
          <Text
            className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            numberOfLines={1}
          >
            {product.brand.name}
          </Text>
        ) : null}
        <Text
          className="min-h-[36px] text-sm font-medium leading-[18px] text-foreground"
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <RatingPill value={product.ratingAvg} count={product.ratingCount} />
        <Price price={product.price} mrp={product.mrp} size="sm" />
        {product.lowStock && product.inStock ? (
          <Text className="text-[11px] font-semibold text-deal">Only a few left</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

/** Horizontal rail used on the home screen and product page. */
export function ProductRail({
  title,
  products,
  action,
  onAction,
}: {
  title: string;
  products: ProductSummary[];
  action?: string;
  onAction?: () => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(172, (width - 48) / 2.2);
  if (!products.length) return null;
  return (
    <View className="gap-3">
      {title || action ? <SectionHeader title={title} action={action} onAction={onAction} /> : null}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      />
    </View>
  );
}
