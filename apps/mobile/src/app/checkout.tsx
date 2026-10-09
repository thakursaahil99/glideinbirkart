import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { hooks } from '@/lib/api';
import { errMsg, formatINR } from '@/lib/format';
import { payForOrder } from '@/lib/payment';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { AddressCard } from '@/components/address';
import { RequireAuth } from '@/components/gate';
import { PriceSummary } from '@/components/price-summary';
import { Button, Card, EmptyState, Icon, Screen, ScreenHeader, Spinner } from '@/components/ui';

type Method = 'RAZORPAY' | 'COD';

function CheckoutBody() {
  const router = useRouter();
  const c = useColors();
  const cart = hooks.useCart();
  const addresses = hooks.useAddresses();
  const settings = hooks.useSettings();
  const checkout = hooks.useCheckout();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('RAZORPAY');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (addressId || !addresses.data?.length) return;
    setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0])?.id ?? null);
  }, [addresses.data, addressId]);

  if (cart.isLoading || addresses.isLoading) return <Spinner />;
  const d = cart.data;
  if (!d?.items.length)
    return (
      <EmptyState
        icon="cart-outline"
        title="Nothing to check out"
        message="Add items to your cart first."
        action="Continue shopping"
        onAction={() => router.replace('/')}
      />
    );

  // Cash-only store: the admin switched online payment off, so Cash on delivery is the only option.
  const onlineEnabled = settings.data?.onlinePaymentsEnabled !== false;
  const codOk =
    !!settings.data?.codEnabled &&
    (!onlineEnabled || d.pricing.total <= (settings.data?.codMaxAmount ?? 0));
  const chosen: Method = onlineEnabled ? method : 'COD';
  const blocked = d.items.some((i) => i.issue);

  const place = async () => {
    if (!addressId)
      return Alert.alert('Select an address', 'Choose where we should deliver this order.');
    setPlacing(true);
    try {
      const result = await checkout.mutateAsync({
        addressId,
        paymentMethod: chosen === 'COD' && codOk ? 'COD' : 'RAZORPAY',
      });
      const orderId = result.order.id;
      if (!result.razorpay) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return router.replace({ pathname: '/orders/[id]', params: { id: orderId, placed: '1' } });
      }
      const outcome = await payForOrder(result);
      if (outcome.status === 'paid') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({ pathname: '/orders/[id]', params: { id: orderId, placed: '1' } });
      } else {
        Alert.alert(
          outcome.status === 'cancelled' ? 'Payment not completed' : 'Online payment unavailable',
          `${outcome.reason}\n\nYour order is saved. You can retry payment from My Orders before it expires.`,
        );
        router.replace({ pathname: '/orders/[id]', params: { id: orderId } });
      }
    } catch (e) {
      Alert.alert('Could not place order', errMsg(e));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <>
      <Screen scroll edges={[]} contentClassName="gap-4 p-4 pb-6">
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-foreground">Delivery address</Text>
            <Pressable hitSlop={8} onPress={() => router.push('/addresses/edit')}>
              <Text className="text-sm font-semibold text-primary">+ Add new</Text>
            </Pressable>
          </View>
          {addresses.data?.length ? (
            addresses.data.map((a) => (
              <AddressCard
                key={a.id}
                address={a}
                selected={a.id === addressId}
                onPress={() => setAddressId(a.id)}
              />
            ))
          ) : (
            <Card className="items-center gap-2">
              <Text className="text-sm text-muted-foreground">You have no saved address yet.</Text>
              <Button title="Add delivery address" onPress={() => router.push('/addresses/edit')} />
            </Card>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-base font-bold text-foreground">Payment method</Text>
          {[
            {
              id: 'RAZORPAY' as const,
              title: 'Pay online',
              sub: 'UPI, cards, net banking, wallets',
              icon: 'card-outline' as const,
              ok: true,
            },
            {
              id: 'COD' as const,
              title: 'Cash on delivery',
              sub: codOk
                ? 'Pay when your order arrives'
                : onlineEnabled
                  ? `Available for orders up to ${formatINR(settings.data?.codMaxAmount ?? 0)}`
                  : 'Not available right now',
              icon: 'cash-outline' as const,
              ok: codOk,
            },
          ]
            .filter((m) => onlineEnabled || m.id === 'COD')
            .map((m) => (
              <Pressable
                key={m.id}
                disabled={!m.ok}
                onPress={() => setMethod(m.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen === m.id, disabled: !m.ok }}
                className={cn(
                  'flex-row items-center gap-3 rounded-2xl border bg-card p-4',
                  chosen === m.id && m.ok ? 'border-primary bg-secondary/40' : 'border-border',
                  !m.ok && 'opacity-50',
                )}
              >
                <Icon name={m.icon} size={24} color={c.primary} />
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">{m.title}</Text>
                  <Text className="text-xs text-muted-foreground">{m.sub}</Text>
                </View>
                <Icon
                  name={chosen === m.id && m.ok ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={chosen === m.id && m.ok ? c.primary : c.mutedForeground}
                />
              </Pressable>
            ))}
        </View>

        <Card>
          <Text className="mb-2 text-base font-bold text-foreground">
            Order summary ({d.itemCount} items)
          </Text>
          <PriceSummary pricing={d.pricing} couponCode={d.coupon?.code} />
        </Card>
      </Screen>
      <View className="flex-row items-center gap-3 border-t border-border bg-card px-4 py-3">
        <View className="flex-1">
          <Text className="text-xs text-muted-foreground">Payable</Text>
          <Text className="text-xl font-extrabold text-foreground">
            {formatINR(d.pricing.total, true)}
          </Text>
        </View>
        <Button
          title={chosen === 'COD' && codOk ? 'Place order' : 'Pay and place order'}
          size="lg"
          variant="deal"
          className="flex-[1.4]"
          loading={placing}
          disabled={blocked || !addressId || (!onlineEnabled && !codOk)}
          onPress={place}
        />
      </View>
    </>
  );
}

export default function CheckoutScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Checkout" onBack={() => router.back()} />
      <RequireAuth
        next="/checkout"
        title="Log in to place your order"
        message="Your cart is saved and will be waiting after you sign in."
      >
        <CheckoutBody />
      </RequireAuth>
    </Screen>
  );
}
