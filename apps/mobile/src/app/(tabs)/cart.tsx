import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { CartItemDto } from '@gk/types';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { errMsg, formatINR, imageUrl } from '@/lib/format';
import { PriceSummary } from '@/components/price-summary';
import { Price } from '@/components/product';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Screen,
  Spinner,
} from '@/components/ui';
import { useColors } from '@/lib/theme';

function Stepper({ item }: { item: CartItemDto }) {
  const setQty = hooks.useSetCartQuantity();
  const remove = hooks.useRemoveFromCart();
  const c = useColors();
  const dec = () =>
    item.quantity <= 1
      ? remove.mutate(item.variantId)
      : setQty.mutate({ variantId: item.variantId, quantity: item.quantity - 1 });
  const inc = () =>
    item.quantity < item.maxQuantity &&
    setQty.mutate({ variantId: item.variantId, quantity: item.quantity + 1 });
  return (
    <View className="h-9 flex-row items-center overflow-hidden rounded-lg border border-border">
      <Pressable
        onPress={dec}
        hitSlop={6}
        accessibilityLabel="Decrease quantity"
        className="w-9 items-center justify-center active:bg-muted"
      >
        <Icon
          name={item.quantity <= 1 ? 'trash-outline' : 'remove'}
          size={16}
          color={item.quantity <= 1 ? c.destructive : c.foreground}
        />
      </Pressable>
      <Text
        className="min-w-8 text-center text-sm font-bold text-foreground"
        accessibilityLabel={`Quantity ${item.quantity}`}
      >
        {item.quantity}
      </Text>
      <Pressable
        onPress={inc}
        disabled={item.quantity >= item.maxQuantity}
        hitSlop={6}
        accessibilityLabel="Increase quantity"
        className="w-9 items-center justify-center active:bg-muted disabled:opacity-40"
      >
        <Icon name="add" size={16} />
      </Pressable>
    </View>
  );
}

function CartLine({ item, saved }: { item: CartItemDto; saved?: boolean }) {
  const router = useRouter();
  const save = hooks.useSaveForLater();
  const move = hooks.useMoveToCart();
  const remove = hooks.useRemoveFromCart();
  return (
    <Card className="gap-3">
      <View className="flex-row gap-3">
        <Pressable
          onPress={() => router.push({ pathname: '/products/[slug]', params: { slug: item.slug } })}
          className="size-24 overflow-hidden rounded-xl bg-muted"
        >
          <Image
            source={{ uri: imageUrl(item.image) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        </Pressable>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold leading-[18px] text-foreground" numberOfLines={2}>
            {item.name}
          </Text>
          {item.variantName ? (
            <Text className="text-xs text-muted-foreground">{item.variantName}</Text>
          ) : null}
          <Text className="text-xs text-muted-foreground">Sold by {item.seller.storeName}</Text>
          <Price
            price={item.price}
            mrp={item.mrp}
            discount={item.discountPercent >= 5 ? item.discountPercent : undefined}
            size="sm"
          />
          {item.issue ? (
            <Text className="text-xs font-semibold text-destructive">{item.issue}</Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        {saved ? null : <Stepper item={item} />}
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => (saved ? move.mutate(item.variantId) : save.mutate(item.variantId))}
            hitSlop={8}
          >
            <Text className="text-sm font-semibold text-primary">
              {saved ? 'Move to cart' : 'Save for later'}
            </Text>
          </Pressable>
          <Pressable onPress={() => remove.mutate(item.variantId)} hitSlop={8}>
            <Text className="text-sm font-semibold text-destructive">Remove</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

function CouponBox({ applied, message }: { applied: string | null; message: string | null }) {
  const [code, setCode] = useState('');
  const apply = hooks.useApplyCoupon();
  const remove = hooks.useRemoveCoupon();
  const coupons = hooks.useCoupons();
  const submit = (value: string) =>
    apply.mutate(value.trim().toUpperCase(), {
      onSuccess: () => setCode(''),
      onError: (e) => Alert.alert('Coupon not applied', errMsg(e)),
    });
  return (
    <Card className="gap-3">
      <Text className="text-base font-bold text-foreground">Coupons</Text>
      {applied ? (
        <View className="flex-row items-center justify-between rounded-xl bg-success/10 px-3 py-2.5">
          <Text className="font-bold text-success">{applied} applied</Text>
          <Pressable onPress={() => remove.mutate()} hitSlop={8}>
            <Text className="text-sm font-semibold text-destructive">Remove</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-start gap-2">
          <Field
            containerClassName="flex-1"
            placeholder="Enter coupon code"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => code && submit(code)}
          />
          <Button
            title="Apply"
            variant="secondary"
            loading={apply.isPending}
            disabled={!code.trim()}
            onPress={() => submit(code)}
          />
        </View>
      )}
      {message ? <Text className="text-xs text-warning">{message}</Text> : null}
      {!applied && coupons.data?.length ? (
        <View className="gap-1.5">
          {coupons.data.slice(0, 3).map((cp) => (
            <Pressable
              key={cp.id}
              onPress={() => submit(cp.code)}
              className="flex-row items-center justify-between rounded-lg border border-dashed border-primary/50 px-3 py-2"
            >
              <View className="flex-1">
                <Text className="text-sm font-bold text-primary">{cp.code}</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {cp.description ??
                    (cp.type === 'FLAT' ? `${formatINR(cp.value)} off` : `${cp.value}% off`)}
                </Text>
              </View>
              <Text className="text-xs font-bold text-primary">TAP TO APPLY</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const cart = hooks.useCart();
  const authed = useAuth((s) => s.status === 'authed');
  const d = cart.data;
  const blocked = !!d?.items.some((i) => i.issue);

  return (
    <Screen>
      <View className="h-14 justify-center border-b border-border px-4">
        <Text className="text-xl font-extrabold text-foreground" accessibilityRole="header">
          My cart {d?.itemCount ? `(${d.itemCount})` : ''}
        </Text>
      </View>
      {cart.isLoading ? (
        <Spinner />
      ) : cart.isError ? (
        <ErrorState onRetry={() => void cart.refetch()} />
      ) : !d || (!d.items.length && !d.saved.length) ? (
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          message="Find something you love and add it here."
          action="Start shopping"
          onAction={() => router.push('/')}
        />
      ) : (
        <>
          <Screen
            scroll
            edges={[]}
            refreshing={cart.isRefetching}
            onRefresh={() => void cart.refetch()}
            contentClassName="gap-3 p-4 pb-6"
          >
            {d.pricing.amountForFreeDelivery > 0 && d.items.length ? (
              <View className="rounded-xl bg-secondary px-3 py-2.5">
                <Text className="text-sm text-secondary-foreground">
                  Add{' '}
                  <Text className="font-bold">{formatINR(d.pricing.amountForFreeDelivery)}</Text>{' '}
                  more for FREE delivery
                </Text>
              </View>
            ) : null}
            {d.items.map((i) => (
              <CartLine key={i.id} item={i} />
            ))}
            {d.items.length ? (
              <CouponBox applied={d.coupon?.code ?? null} message={d.couponMessage} />
            ) : null}
            {d.items.length ? (
              <Card>
                <Text className="mb-2 text-base font-bold text-foreground">Price details</Text>
                <PriceSummary pricing={d.pricing} couponCode={d.coupon?.code} />
              </Card>
            ) : null}
            {d.saved.length ? (
              <>
                <Text className="mt-2 text-base font-bold text-foreground">
                  Saved for later ({d.saved.length})
                </Text>
                {d.saved.map((i) => (
                  <CartLine key={i.id} item={i} saved />
                ))}
              </>
            ) : null}
          </Screen>
          {d.items.length ? (
            <View className="flex-row items-center gap-3 border-t border-border bg-card px-4 py-3">
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground">Total</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {formatINR(d.pricing.total, true)}
                </Text>
              </View>
              <Button
                title={authed ? 'Checkout' : 'Login to checkout'}
                size="lg"
                disabled={blocked}
                className="flex-1"
                onPress={() =>
                  router.push(
                    authed
                      ? '/checkout'
                      : { pathname: '/auth/login', params: { next: '/checkout' } },
                  )
                }
              />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
