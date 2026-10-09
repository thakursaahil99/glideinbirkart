import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ProductDetail, VariantDto } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { SITE_URL } from '@/lib/config';
import { errMsg, formatDate, formatINR, imageUrl } from '@/lib/format';
import { viewedProducts } from '@/lib/storage';
import { useColors } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { Price, ProductRail, WishlistHeart } from '@/components/product';
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  Field,
  Icon,
  IconButton,
  Screen,
  SectionHeader,
  Skeleton,
  Spinner,
  Stars,
} from '@/components/ui';

function Gallery({ images }: { images: ProductDetail['images'] }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  return (
    <View>
      <FlatList
        ref={list}
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(i) => i.id}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: width }} className="bg-muted">
            <Image
              source={{ uri: imageUrl(item.url) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              transition={150}
              accessibilityLabel={item.alt ?? 'Product image'}
            />
          </View>
        )}
      />
      {images.length > 1 ? (
        <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-1.5">
          {images.map((img, i) => (
            <View
              key={img.id}
              className={
                i === index
                  ? 'h-1.5 w-5 rounded-full bg-primary'
                  : 'size-1.5 rounded-full bg-foreground/30'
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OptionPicker({
  product,
  variant,
  onPick,
}: {
  product: ProductDetail;
  variant: VariantDto;
  onPick: (key: string, value: string) => void;
}) {
  return (
    <View className="gap-4">
      {product.options.map((opt) => (
        <View key={opt.key} className="gap-2">
          <Text className="text-sm font-bold text-foreground">
            {opt.label}:{' '}
            <Text className="font-normal text-muted-foreground">{variant.attributes[opt.key]}</Text>
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {opt.values.map((v) => {
              const selected = variant.attributes[opt.key] === v.value;
              const exists = product.variants.some(
                (x) => x.attributes[opt.key] === v.value && x.inStock,
              );
              return opt.type === 'COLOR' && v.hex ? (
                <Pressable
                  key={v.value}
                  onPress={() => onPick(opt.key, v.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={v.value}
                  accessibilityState={{ selected }}
                  className={cn(
                    'size-10 items-center justify-center rounded-full border-2',
                    selected ? 'border-primary' : 'border-border',
                    !exists && 'opacity-40',
                  )}
                >
                  <View
                    style={{ backgroundColor: v.hex }}
                    className="size-7 rounded-full border border-border"
                  />
                </Pressable>
              ) : (
                <Pressable
                  key={v.value}
                  onPress={() => onPick(opt.key, v.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={cn(
                    'min-w-12 items-center rounded-lg border px-3 py-2',
                    selected ? 'border-primary bg-secondary' : 'border-border bg-card',
                    !exists && 'opacity-40',
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      selected ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {v.value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function PincodeCheck() {
  const [pin, setPin] = useState('');
  const check = hooks.usePincode(pin);
  return (
    <Card className="gap-2">
      <Text className="text-sm font-bold text-foreground">Delivery</Text>
      <Field
        placeholder="Enter 6-digit PIN code"
        keyboardType="number-pad"
        maxLength={6}
        value={pin}
        onChangeText={setPin}
      />
      {check.data ? (
        <Text
          className={cn('text-sm', check.data.serviceable ? 'text-success' : 'text-destructive')}
        >
          {check.data.serviceable
            ? `Delivery to ${check.data.city} by ${formatDate(check.data.eta)}${check.data.codAvailable ? ' · Cash on delivery available' : ''}`
            : check.data.message}
        </Text>
      ) : null}
    </Card>
  );
}

function Reviews({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const reviews = hooks.useReviews(product.id, { limit: 4, sort: 'helpful' });
  const total = product.ratingCount;
  return (
    <View className="gap-3">
      <SectionHeader
        title={`Ratings and reviews`}
        className="px-0"
        action="Write a review"
        onAction={() =>
          router.push({ pathname: '/review/[productId]', params: { productId: product.id } })
        }
      />
      {total ? (
        <View className="flex-row items-center gap-4">
          <View className="items-center">
            <Text className="text-4xl font-extrabold text-foreground">
              {product.ratingAvg.toFixed(1)}
            </Text>
            <Stars value={product.ratingAvg} />
            <Text className="mt-1 text-xs text-muted-foreground">{total} ratings</Text>
          </View>
          <View className="flex-1 gap-1">
            {([5, 4, 3, 2, 1] as const).map((s) => (
              <View key={s} className="flex-row items-center gap-2">
                <Text className="w-3 text-xs text-muted-foreground">{s}</Text>
                <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <View
                    style={{ width: `${(product.ratingBreakdown[s] / total) * 100}%` }}
                    className="h-full rounded-full bg-success"
                  />
                </View>
                <Text className="w-7 text-right text-xs text-muted-foreground">
                  {product.ratingBreakdown[s]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">
          No reviews yet. Be the first to share your experience.
        </Text>
      )}
      {reviews.data?.items.map((r) => (
        <View key={r.id} className="gap-1.5 border-t border-border pt-3">
          <View className="flex-row items-center gap-2">
            <Stars value={r.rating} size={13} />
            {r.isVerifiedPurchase ? <Badge tone="success">Verified purchase</Badge> : null}
          </View>
          {r.title ? <Text className="font-bold text-foreground">{r.title}</Text> : null}
          {r.body ? <Text className="text-sm leading-5 text-foreground">{r.body}</Text> : null}
          <Text className="text-xs text-muted-foreground">
            {r.user.name} · {formatDate(r.createdAt)}
          </Text>
          {r.sellerReply ? (
            <View className="rounded-lg bg-muted p-2.5">
              <Text className="text-xs font-bold text-foreground">Seller response</Text>
              <Text className="text-xs text-foreground">{r.sellerReply}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Questions({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const authed = useAuth((s) => s.status === 'authed');
  const qs = hooks.useQuestions(product.id, { limit: 3 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!authed) return router.push('/auth/login');
    setBusy(true);
    try {
      await api.qna.ask(product.id, text.trim());
      setText('');
      await qs.refetch();
      Alert.alert('Question posted', 'The seller and other buyers can now answer it.');
    } catch (e) {
      Alert.alert('Could not post', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-3">
      <SectionHeader title="Questions and answers" className="px-0" />
      {qs.data?.items.map((q) => (
        <View key={q.id} className="gap-1">
          <Text className="text-sm font-bold text-foreground">Q: {q.body}</Text>
          {q.answers[0] ? (
            <Text className="text-sm text-foreground">
              A: {q.answers[0].body}
              {q.answers[0].isSeller ? ' (Seller)' : ''}
            </Text>
          ) : (
            <Text className="text-xs text-muted-foreground">No answers yet</Text>
          )}
        </View>
      ))}
      <Field placeholder="Ask a question about this product" value={text} onChangeText={setText} />
      <Button
        title="Post question"
        variant="outline"
        loading={busy}
        disabled={text.trim().length < 5}
        onPress={ask}
      />
    </View>
  );
}

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const c = useColors();
  const q = hooks.useProduct(slug);
  const p = q.data;
  const similar = hooks.useSimilar(p?.id);
  const fbt = hooks.useFrequentlyBought(p?.id);
  const add = hooks.useAddToCart();
  const cart = hooks.useCart();
  const authed = useAuth((s) => s.status === 'authed');
  const [variantId, setVariantId] = useState<string | null>(null);

  const variant = useMemo(
    () =>
      p?.variants.find((v) => v.id === variantId) ??
      p?.variants.find((v) => v.isDefault) ??
      p?.variants[0],
    [p, variantId],
  );
  const inCart = !!variant && !!cart.data?.items.some((i) => i.variantId === variant.id);

  const productId = p?.id;
  useEffect(() => {
    if (!productId) return;
    void viewedProducts.add(productId);
    void api.products.trackView(productId).catch(() => undefined);
  }, [productId]);

  const pick = (key: string, value: string) => {
    if (!p || !variant) return;
    const wanted = { ...variant.attributes, [key]: value };
    const exact = p.variants.find((v) =>
      Object.entries(wanted).every(([k, val]) => v.attributes[k] === val),
    );
    const fallback =
      p.variants.find((v) => v.attributes[key] === value && v.inStock) ??
      p.variants.find((v) => v.attributes[key] === value);
    const next = exact ?? fallback;
    if (next) setVariantId(next.id);
  };

  const images = useMemo(() => {
    if (!p) return [];
    const forVariant = variant ? p.images.filter((i) => variant.imageIds.includes(i.id)) : [];
    return forVariant.length
      ? [...forVariant, ...p.images.filter((i) => !forVariant.includes(i))]
      : p.images;
  }, [p, variant]);

  const goCheckout = () =>
    router.push(authed ? '/checkout' : { pathname: '/auth/login', params: { next: '/checkout' } });

  const addToCart = async (buyNow = false) => {
    if (!variant) return;
    try {
      await add.mutateAsync({ variantId: variant.id, quantity: 1 });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (buyNow) goCheckout();
    } catch (e) {
      Alert.alert('Could not add to cart', errMsg(e));
    }
  };

  if (q.isLoading)
    return (
      <Screen>
        <View className="p-4 gap-4">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-8 w-1/3" />
        </View>
      </Screen>
    );
  if (q.isError || !p || !variant)
    return (
      <Screen>
        <View className="h-14 px-2 justify-center">
          <IconButton name="chevron-back" label="Go back" onPress={() => router.back()} />
        </View>
        <ErrorState message="This product could not be loaded." onRetry={() => void q.refetch()} />
      </Screen>
    );

  const stock = variant.stock;
  return (
    <Screen>
      <View className="h-14 flex-row items-center gap-1 px-2">
        <IconButton name="chevron-back" label="Go back" onPress={() => router.back()} />
        <View className="flex-1" />
        <IconButton
          name="share-social-outline"
          label="Share"
          onPress={() =>
            void Share.share({
              message: `${p.name} on Glideinbir Kart\n${SITE_URL}/products/${p.slug}`,
            })
          }
        />
        <WishlistHeart productId={p.id} />
        <IconButton
          name="cart-outline"
          label="Cart"
          badge={cart.data?.itemCount}
          onPress={() => router.push('/(tabs)/cart')}
        />
      </View>
      <Screen scroll edges={[]} contentClassName="gap-5 pb-8">
        <Gallery images={images} />
        <View className="gap-2 px-4">
          {p.brand ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/products', params: { brand: p.brand?.slug } })
              }
            >
              <Text className="text-xs font-bold uppercase tracking-wide text-primary">
                {p.brand.name}
              </Text>
            </Pressable>
          ) : null}
          <Text className="text-xl font-bold leading-7 text-foreground" accessibilityRole="header">
            {p.name}
          </Text>
          {p.ratingCount ? (
            <View className="flex-row items-center gap-2">
              <Stars value={p.ratingAvg} />
              <Text className="text-sm text-muted-foreground">
                {p.ratingAvg.toFixed(1)} ({p.ratingCount})
              </Text>
            </View>
          ) : null}
          <Price
            price={variant.price}
            mrp={variant.mrp}
            discount={variant.discountPercent >= 1 ? variant.discountPercent : undefined}
            size="lg"
          />
          <Text className="text-xs text-muted-foreground">
            Inclusive of all taxes (GST {p.gstRate}%)
          </Text>
          {!variant.inStock ? (
            <Badge tone="destructive">Out of stock</Badge>
          ) : stock <= 5 ? (
            <Badge tone="warning">{`Only ${stock} left`}</Badge>
          ) : (
            <Badge tone="success">In stock</Badge>
          )}
        </View>

        {p.options.length ? (
          <View className="px-4">
            <OptionPicker product={p} variant={variant} onPick={pick} />
          </View>
        ) : null}
        <View className="px-4">
          <PincodeCheck />
        </View>

        <View className="gap-3 px-4">
          <View className="flex-row gap-3">
            {[
              { icon: 'shield-checkmark-outline' as const, text: 'Secure payments' },
              {
                icon: 'return-down-back-outline' as const,
                text: p.isReturnable ? `${p.returnWindowDays}-day returns` : 'No returns',
              },
              { icon: 'receipt-outline' as const, text: 'GST invoice' },
            ].map((x) => (
              <View
                key={x.text}
                className="flex-1 items-center gap-1 rounded-xl bg-secondary px-2 py-3"
              >
                <Icon name={x.icon} size={20} color={c.primary} />
                <Text className="text-center text-[11px] font-semibold text-secondary-foreground">
                  {x.text}
                </Text>
              </View>
            ))}
          </View>
          <Text className="text-sm text-muted-foreground">
            Sold by <Text className="font-bold text-foreground">{p.sellerInfo.storeName}</Text>
            {p.sellerInfo.ratingCount ? ` · ${p.sellerInfo.ratingAvg.toFixed(1)}★` : ''}
          </Text>
        </View>

        <Divider />
        <View className="gap-2 px-4">
          <SectionHeader title="About this item" className="px-0" />
          {p.highlights.map((h) => (
            <View key={h} className="flex-row gap-2">
              <Text className="text-primary">•</Text>
              <Text className="flex-1 text-sm leading-5 text-foreground">{h}</Text>
            </View>
          ))}
          <Text className="mt-1 text-sm leading-5 text-muted-foreground">{p.description}</Text>
        </View>
        {p.specifications.length ? (
          <View className="gap-1 px-4">
            <SectionHeader title="Specifications" className="px-0 pb-1" />
            {p.specifications.map((s, i) => (
              <View
                key={s.key}
                className={cn('flex-row gap-3 rounded-lg px-3 py-2', i % 2 === 0 && 'bg-muted/60')}
              >
                <Text className="w-2/5 text-sm text-muted-foreground">{s.key}</Text>
                <Text className="flex-1 text-sm font-medium text-foreground">{s.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {fbt.data?.length ? (
          <ProductRail title="Frequently bought together" products={fbt.data} />
        ) : null}
        <View className="px-4">
          <Reviews product={p} />
        </View>
        <View className="px-4">
          <Questions product={p} />
        </View>
        {similar.isLoading ? (
          <Spinner />
        ) : (
          <ProductRail title="Similar products" products={similar.data ?? []} />
        )}
      </Screen>

      <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
        {inCart ? (
          <Button
            title="Go to cart"
            icon="cart"
            className="flex-1"
            size="lg"
            variant="secondary"
            onPress={() => router.push('/(tabs)/cart')}
          />
        ) : (
          <Button
            title="Add to cart"
            icon="cart-outline"
            className="flex-1"
            size="lg"
            variant="outline"
            loading={add.isPending}
            disabled={!variant.inStock}
            onPress={() => addToCart(false)}
          />
        )}
        <Button
          title={`Buy now · ${formatINR(variant.price)}`}
          className="flex-[1.3]"
          size="lg"
          variant="deal"
          disabled={!variant.inStock}
          loading={add.isPending && !inCart}
          onPress={() => (inCart ? goCheckout() : addToCart(true))}
        />
      </View>
    </Screen>
  );
}
