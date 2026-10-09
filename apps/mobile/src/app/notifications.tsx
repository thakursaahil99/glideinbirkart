import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { NotificationDto } from '@gk/types';
import { hooks } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { RequireAuth } from '@/components/gate';
import {
  EmptyState,
  ErrorState,
  Icon,
  Screen,
  ScreenHeader,
  Spinner,
  type IconName,
} from '@/components/ui';

const ICONS: Record<string, IconName> = {
  ORDER: 'cube-outline',
  PAYMENT: 'card-outline',
  PROMO: 'pricetag-outline',
  REVIEW: 'star-outline',
  QNA: 'chatbubble-ellipses-outline',
  PRODUCT: 'bag-outline',
  SELLER: 'storefront-outline',
  SYSTEM: 'information-circle-outline',
};

function List() {
  const router = useRouter();
  const c = useColors();
  const q = hooks.useNotifications({ limit: 50 });
  const read = hooks.useMarkNotificationRead();
  const readAll = hooks.useMarkAllRead();

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length)
    return (
      <EmptyState
        icon="notifications-outline"
        title="You are all caught up"
        message="Order updates and offers will show up here."
      />
    );

  const open = (n: NotificationDto) => {
    if (!n.readAt) read.mutate(n.id);
    const d = n.data ?? {};
    if (typeof d.orderId === 'string')
      router.push({ pathname: '/orders/[id]', params: { id: d.orderId } });
    else if (typeof d.productSlug === 'string')
      router.push({ pathname: '/products/[slug]', params: { slug: d.productSlug } });
    else if (typeof d.returnId === 'string') router.push('/returns');
  };

  return (
    <FlatList
      data={q.data.items}
      keyExtractor={(n) => n.id}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      ListHeaderComponent={
        (q.data.meta.unread ?? 0) > 0 ? (
          <Pressable onPress={() => readAll.mutate()} className="items-end px-4 py-2" hitSlop={8}>
            <Text className="text-sm font-semibold text-primary">Mark all as read</Text>
          </Pressable>
        ) : null
      }
      renderItem={({ item: n }) => (
        <Pressable
          onPress={() => open(n)}
          accessibilityRole="button"
          className={cn(
            'flex-row gap-3 border-b border-border px-4 py-3.5',
            !n.readAt && 'bg-secondary/40',
          )}
        >
          <View className="size-10 items-center justify-center rounded-full bg-secondary">
            <Icon name={ICONS[n.type] ?? 'notifications-outline'} size={20} color={c.primary} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className={cn('text-sm text-foreground', !n.readAt && 'font-bold')}>
              {n.title}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">{n.body}</Text>
            <Text className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</Text>
          </View>
          {!n.readAt ? <View className="mt-1.5 size-2 rounded-full bg-primary" /> : null}
        </Pressable>
      )}
    />
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />
      <RequireAuth next="/notifications">
        <List />
      </RequireAuth>
    </Screen>
  );
}
