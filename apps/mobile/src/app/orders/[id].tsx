import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { OrderDto, SubOrderDto } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { errMsg, formatDate, formatINR, imageUrl, titleCase } from '@/lib/format';
import { shareInvoice } from '@/lib/invoice';
import { payForOrder } from '@/lib/payment';
import { ORDER_TONE, SUB_ORDER_TONE } from '@/lib/status';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { RequireAuth } from '@/components/gate';
import { PriceSummary } from '@/components/price-summary';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Icon,
  Screen,
  ScreenHeader,
  Spinner,
} from '@/components/ui';

const REASONS = [
  'Ordered by mistake',
  'Found a better price',
  'Delivery is taking too long',
  'Want to change address or items',
  'Other',
];

function Timeline({ order }: { order: OrderDto }) {
  const c = useColors();
  return (
    <View className="gap-0">
      {order.timeline.map((t, i) => (
        <View key={t.id} className="flex-row gap-3">
          <View className="items-center">
            <View
              className={cn(
                'size-3 rounded-full',
                i === order.timeline.length - 1 ? 'bg-primary' : 'bg-border',
              )}
            />
            {i < order.timeline.length - 1 ? <View className="w-0.5 flex-1 bg-border" /> : null}
          </View>
          <View className="flex-1 pb-4">
            <Text className="-mt-1 text-sm font-semibold text-foreground">
              {titleCase(t.status)}
            </Text>
            {t.note ? <Text className="text-xs text-muted-foreground">{t.note}</Text> : null}
            <Text className="text-xs text-muted-foreground">{formatDate(t.createdAt, true)}</Text>
          </View>
        </View>
      ))}
      {!order.timeline.length ? (
        <Icon name="time-outline" size={18} color={c.mutedForeground} />
      ) : null}
    </View>
  );
}

function SubOrder({ sub }: { sub: SubOrderDto }) {
  const router = useRouter();
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-sm font-bold text-foreground" numberOfLines={1}>
          Sold by {sub.seller.storeName}
        </Text>
        <Badge tone={SUB_ORDER_TONE[sub.status]}>{titleCase(sub.status)}</Badge>
      </View>
      {sub.trackingId ? (
        <Pressable
          disabled={!sub.trackingUrl}
          onPress={() => sub.trackingUrl && void Linking.openURL(sub.trackingUrl)}
          className="rounded-lg bg-muted px-3 py-2"
        >
          <Text className="text-xs text-foreground">
            {sub.courier}: <Text className="font-bold">{sub.trackingId}</Text>
            {sub.trackingUrl ? '  (track)' : ''}
          </Text>
        </Pressable>
      ) : null}
      {sub.items.map((it) => (
        <View key={it.id} className="gap-2 border-t border-border pt-3">
          <Pressable
            onPress={() => router.push({ pathname: '/products/[slug]', params: { slug: it.slug } })}
            className="flex-row gap-3"
          >
            <View className="size-16 overflow-hidden rounded-lg bg-muted">
              <Image
                source={{ uri: imageUrl(it.image) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                {it.name}
              </Text>
              {it.variantName ? (
                <Text className="text-xs text-muted-foreground">{it.variantName}</Text>
              ) : null}
              <Text className="text-xs text-muted-foreground">
                Qty {it.quantity} · {formatINR(it.unitPrice)} each
              </Text>
            </View>
            <Text className="text-sm font-bold text-foreground">{formatINR(it.lineTotal)}</Text>
          </Pressable>
          <View className="flex-row flex-wrap gap-2">
            {it.canReview && !it.reviewed ? (
              <Button
                size="sm"
                variant="outline"
                title="Rate and review"
                icon="star-outline"
                onPress={() =>
                  router.push({
                    pathname: '/review/[productId]',
                    params: { productId: it.productId, orderItemId: it.id, name: it.name },
                  })
                }
              />
            ) : null}
            {it.canReturn ? (
              <Button
                size="sm"
                variant="outline"
                title="Return item"
                icon="return-down-back-outline"
                onPress={() =>
                  router.push({
                    pathname: '/return/[orderItemId]',
                    params: {
                      orderItemId: it.id,
                      name: it.name,
                      max: String(it.quantity - it.returnedQty),
                    },
                  })
                }
              />
            ) : null}
            {it.returnRequest ? (
              <Badge tone="warning">{`Return ${titleCase(it.returnRequest.status)}`}</Badge>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

function OrderBody({ id, placed }: { id: string; placed: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = hooks.useOrder(id);
  const cancel = hooks.useCancelOrder();
  const [busy, setBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const o = q.data;

  if (q.isLoading) return <Spinner />;
  if (q.isError || !o)
    return <ErrorState message="We could not load this order." onRetry={() => void q.refetch()} />;

  const askCancel = () =>
    Alert.alert('Cancel this order?', 'Choose a reason', [
      ...REASONS.map((reason) => ({
        text: reason,
        onPress: () =>
          cancel.mutate(
            { id: o.id, reason },
            { onError: (e) => Alert.alert('Could not cancel', errMsg(e)) },
          ),
      })),
      { text: 'Keep order', style: 'cancel' as const },
    ]);

  const downloadInvoice = async () => {
    setInvoiceBusy(true);
    try {
      await shareInvoice(o.id, o.invoiceNumber);
    } catch (e) {
      Alert.alert('Could not download invoice', errMsg(e));
    } finally {
      setInvoiceBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    try {
      const result = await api.payments.retry(o.id);
      const outcome = await payForOrder(result);
      if (outcome.status !== 'paid') Alert.alert('Payment not completed', outcome.reason);
      await qc.invalidateQueries({ queryKey: ['order'] });
      await qc.invalidateQueries({ queryKey: ['orders-infinite'] });
    } catch (e) {
      Alert.alert('Could not start payment', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const awaitingPayment = o.status === 'PENDING_PAYMENT' || o.status === 'PAYMENT_FAILED';
  const a = o.shippingAddress;

  return (
    <Screen
      scroll
      edges={[]}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      contentClassName="gap-4 p-4 pb-10"
    >
      {placed && o.status !== 'PAYMENT_FAILED' ? (
        <View className="items-center gap-2 rounded-2xl bg-success/10 p-5">
          <Icon name="checkmark-circle" size={48} color="#1f9d62" />
          <Text className="text-xl font-extrabold text-foreground">Order placed!</Text>
          <Text className="text-center text-sm text-muted-foreground">
            Thank you. We will keep you posted by notification and email.
          </Text>
        </View>
      ) : null}

      <Card className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-extrabold text-foreground">Order #{o.orderNumber}</Text>
          <Badge tone={ORDER_TONE[o.status]}>{titleCase(o.status)}</Badge>
        </View>
        <Text className="text-xs text-muted-foreground">
          Placed {formatDate(o.placedAt ?? o.createdAt, true)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online payment'} ·{' '}
          {titleCase(o.paymentStatus)}
        </Text>
      </Card>

      {awaitingPayment && o.paymentMethod === 'RAZORPAY' ? (
        <Card className="gap-3 border-warning">
          <Text className="text-sm text-foreground">
            {o.status === 'PAYMENT_FAILED'
              ? 'Your payment did not go through.'
              : 'Payment is pending.'}{' '}
            {o.expiresAt
              ? `Complete it before ${formatDate(o.expiresAt, true)} or the order will be released.`
              : ''}
          </Text>
          <Button
            title={`Pay ${formatINR(o.pricing.total, true)}`}
            variant="deal"
            loading={busy}
            onPress={retry}
          />
        </Card>
      ) : null}

      {o.subOrders.map((s) => (
        <SubOrder key={s.id} sub={s} />
      ))}

      <Card className="gap-2">
        <Text className="text-base font-bold text-foreground">Delivery address</Text>
        <Text className="text-sm leading-5 text-foreground">
          {a.fullName}
          {'\n'}
          {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}
          {'\n'}
          {a.city}, {a.state} {a.pincode}
          {'\n'}Phone: {a.phone}
        </Text>
      </Card>

      <Card>
        <Text className="mb-2 text-base font-bold text-foreground">Price details</Text>
        <PriceSummary pricing={o.pricing} couponCode={o.couponCode} />
      </Card>

      <Card className="gap-3">
        <Text className="text-base font-bold text-foreground">Order timeline</Text>
        <Timeline order={o} />
      </Card>

      {o.hasInvoice ? (
        <Button
          title={`Download GST invoice (${o.invoiceNumber})`}
          variant="outline"
          icon="document-text-outline"
          loading={invoiceBusy}
          onPress={downloadInvoice}
        />
      ) : null}
      {o.canCancel ? (
        <Button
          title="Cancel order"
          variant="outline"
          icon="close-circle-outline"
          loading={cancel.isPending}
          onPress={askCancel}
        />
      ) : null}
      <Button title="Continue shopping" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  return (
    <Screen>
      <ScreenHeader
        title="Order details"
        onBack={() => (placed ? router.replace('/orders') : router.back())}
      />
      <RequireAuth next={`/orders/${id}`}>
        <OrderBody id={id} placed={!!placed} />
      </RequireAuth>
    </Screen>
  );
}
