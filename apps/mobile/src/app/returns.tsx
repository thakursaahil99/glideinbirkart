import { FlatList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { hooks } from '@/lib/api';
import { formatDate, formatINR, imageUrl, titleCase } from '@/lib/format';
import { RETURN_TONE } from '@/lib/status';
import { RequireAuth } from '@/components/gate';
import { Badge, EmptyState, ErrorState, Screen, ScreenHeader, Spinner } from '@/components/ui';

function ReturnsList() {
  const q = hooks.useReturns({ limit: 50 });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length)
    return (
      <EmptyState
        icon="return-down-back-outline"
        title="No returns yet"
        message="Items you return will be tracked here."
      />
    );
  return (
    <FlatList
      data={q.data.items}
      keyExtractor={(r) => r.id}
      contentContainerClassName="gap-3 p-4"
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      renderItem={({ item: r }) => (
        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row gap-3">
            <View className="size-14 overflow-hidden rounded-lg bg-muted">
              <Image
                source={{ uri: imageUrl(r.itemImage) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
                {r.itemName}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Order #{r.orderNumber} · Qty {r.quantity}
              </Text>
              <Text className="text-xs text-muted-foreground">{r.reason}</Text>
            </View>
            <Badge tone={RETURN_TONE[r.status]}>{titleCase(r.status)}</Badge>
          </View>
          {r.sellerRemarks ? (
            <Text className="text-xs text-foreground">Seller: {r.sellerRemarks}</Text>
          ) : null}
          {r.adminRemarks ? (
            <Text className="text-xs text-foreground">Support: {r.adminRemarks}</Text>
          ) : null}
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">
              Requested {formatDate(r.createdAt)}
            </Text>
            {r.refundAmount ? (
              <Text className="text-xs font-bold text-success">
                Refund {formatINR(r.refundAmount)}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    />
  );
}

export default function ReturnsScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Returns and refunds" onBack={() => router.back()} />
      <RequireAuth next="/returns">
        <ReturnsList />
      </RequireAuth>
    </Screen>
  );
}
