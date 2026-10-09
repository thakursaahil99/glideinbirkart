import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { OrderSummaryDto } from '@gk/types';
import { hooks } from '@/lib/api';
import { formatDate, formatINR, imageUrl, titleCase } from '@/lib/format';
import { ORDER_TONE } from '@/lib/status';
import { RequireAuth } from '@/components/gate';
import {
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  Spinner,
} from '@/components/ui';

const FILTERS: Array<{ label: string; value?: string }> = [
  { label: 'All' },
  { label: 'Active', value: 'PROCESSING' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

function OrderRow({ order }: { order: OrderSummaryDto }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
      accessibilityRole="link"
      className="gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-90"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-foreground">#{order.orderNumber}</Text>
        <Badge tone={ORDER_TONE[order.status]}>{titleCase(order.status)}</Badge>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-row">
          {order.previewImages.slice(0, 3).map((img, i) => (
            <View
              key={`${img}${i}`}
              className="-mr-3 size-14 overflow-hidden rounded-lg border-2 border-card bg-muted"
            >
              <Image
                source={{ uri: imageUrl(img) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
          ))}
        </View>
        <View className="ml-3 flex-1 justify-center">
          <Text className="text-sm text-foreground" numberOfLines={1}>
            {order.firstItemName}
            {order.itemCount > 1 ? ` + ${order.itemCount - 1} more` : ''}
          </Text>
          <Text className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</Text>
        </View>
        <Text className="self-center text-base font-extrabold text-foreground">
          {formatINR(order.total)}
        </Text>
      </View>
    </Pressable>
  );
}

function OrdersList() {
  const router = useRouter();
  const [status, setStatus] = useState<string | undefined>();
  const q = hooks.useOrdersInfinite({ status });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 py-3"
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.label}
              label={f.label}
              selected={status === f.value}
              onPress={() => setStatus(f.value)}
            />
          ))}
        </ScrollView>
      </View>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon="cube-outline"
          title="No orders here"
          message={status ? 'Try another filter.' : 'When you place an order it will show up here.'}
          action="Start shopping"
          onAction={() => router.push('/')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          contentContainerClassName="gap-3 p-4 pt-1"
          renderItem={({ item }) => <OrderRow order={item} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          onEndReachedThreshold={0.5}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => void q.refetch()}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator className="py-4" /> : null}
        />
      )}
    </>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader
        title="My orders"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <RequireAuth title="Log in to see your orders" next="/orders">
        <OrdersList />
      </RequireAuth>
    </Screen>
  );
}
