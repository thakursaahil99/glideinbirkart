import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/gate';
import { ProductCard } from '@/components/product';
import { EmptyState, ErrorState, Screen, Spinner } from '@/components/ui';

function WishlistList() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const authed = useAuth((s) => s.status === 'authed');
  const q = hooks.useWishlist({ limit: 60 }, { enabled: authed });
  const cardW = (width - 44) / 2;
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length)
    return (
      <EmptyState
        icon="heart-outline"
        title="Your wishlist is empty"
        message="Tap the heart on any product to save it here."
        action="Discover products"
        onAction={() => router.push('/')}
      />
    );
  return (
    <FlatList
      data={q.data.items}
      numColumns={2}
      keyExtractor={(w) => w.id}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      columnWrapperClassName="gap-3 px-4"
      contentContainerClassName="gap-3 pb-6 pt-3"
      renderItem={({ item }) => <ProductCard product={item.product} width={cardW} />}
    />
  );
}

export default function WishlistScreen() {
  return (
    <Screen>
      <View className="h-14 justify-center border-b border-border px-4">
        <Text className="text-xl font-extrabold text-foreground" accessibilityRole="header">
          Wishlist
        </Text>
      </View>
      <RequireAuth
        title="Save what you love"
        message="Sign in to keep a wishlist across your devices."
      >
        <WishlistList />
      </RequireAuth>
    </Screen>
  );
}
