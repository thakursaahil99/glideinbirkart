import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { BannerDto, CategoryDto } from '@gk/types';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { imageUrl } from '@/lib/format';
import { ProductRail } from '@/components/product';
import { ErrorState, Icon, IconButton, Screen, SectionHeader, Skeleton } from '@/components/ui';
import { useColors } from '@/lib/theme';

function openLink(router: ReturnType<typeof useRouter>, url: string | null) {
  if (!url) return;
  // Banner links are web paths: /c/<category>, /products/<product>, /search?q=...
  const cat = url.match(/^\/c\/([\w-]+)/);
  if (cat?.[1]) return router.push({ pathname: '/products', params: { category: cat[1] } });
  const prod = url.match(/^\/products\/([\w-]+)/);
  if (prod?.[1]) return router.push({ pathname: '/products/[slug]', params: { slug: prod[1] } });
  const search = url.match(/^\/search(?:\?q=([^&]+))?/);
  if (search)
    return router.push(
      search[1]
        ? { pathname: '/products', params: { q: decodeURIComponent(search[1]) } }
        : '/search',
    );
  router.push('/products');
}

function Hero({ banners }: { banners: BannerDto[] }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<BannerDto>>(null);
  const itemW = width - 32;

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        list.current?.scrollToOffset({ offset: next * (itemW + 12), animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [banners.length, itemW]);

  if (!banners.length) return null;
  return (
    <View className="gap-2">
      <FlatList
        ref={list}
        data={banners}
        horizontal
        snapToInterval={itemW + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(b) => b.id}
        contentContainerClassName="gap-3 px-4"
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / (itemW + 12)))
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openLink(router, item.linkUrl)}
            accessibilityRole="link"
            accessibilityLabel={item.title}
            style={{ width: itemW }}
            className="aspect-[16/8] overflow-hidden rounded-2xl bg-muted"
          >
            <Image
              source={{ uri: imageUrl(item.mobileImageUrl ?? item.imageUrl) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={200}
            />
            <View className="absolute inset-0 justify-end bg-black/25 p-4">
              <Text className="text-xl font-extrabold text-white" numberOfLines={2}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text className="text-sm text-white/90" numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      {banners.length > 1 ? (
        <View className="flex-row justify-center gap-1.5">
          {banners.map((b, i) => (
            <View
              key={b.id}
              className={
                i === index
                  ? 'h-1.5 w-5 rounded-full bg-primary'
                  : 'size-1.5 rounded-full bg-border'
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CategoryStrip({ categories }: { categories: CategoryDto[] }) {
  const router = useRouter();
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={categories}
      keyExtractor={(c) => c.id}
      contentContainerClassName="gap-4 px-4"
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/products', params: { category: item.slug } })}
          accessibilityRole="link"
          accessibilityLabel={item.name}
          className="w-[68px] items-center gap-1.5"
        >
          <View className="size-16 overflow-hidden rounded-full border border-border bg-secondary">
            {item.imageUrl ? (
              <Image
                source={{ uri: imageUrl(item.imageUrl) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : null}
          </View>
          <Text className="text-center text-xs font-medium text-foreground" numberOfLines={2}>
            {item.name}
          </Text>
        </Pressable>
      )}
    />
  );
}

function useCountdown(endsAt?: string) {
  const [left, setLeft] = useState(() => (endsAt ? new Date(endsAt).getTime() - Date.now() : 0));
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    over: left <= 0,
    text: `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`,
  };
}

function DealsRail({
  endsAt,
  products,
}: {
  endsAt: string;
  products: React.ComponentProps<typeof ProductRail>['products'];
}) {
  const router = useRouter();
  const { over, text } = useCountdown(endsAt);
  if (over || !products.length) return null;
  return (
    <View className="mx-0 gap-1 bg-deal/10 py-4">
      <View className="flex-row items-center gap-2 px-4">
        <Icon name="flash" size={18} color="#f0592a" />
        <Text className="flex-1 text-lg font-extrabold text-foreground">Deals of the day</Text>
        <View className="rounded-lg bg-deal px-2 py-1">
          <Text
            className="font-mono text-xs font-bold text-deal-foreground"
            accessibilityLabel={`Ends in ${text}`}
          >
            {text}
          </Text>
        </View>
      </View>
      <ProductRail
        title=""
        products={products}
        action="See all"
        onAction={() => router.push({ pathname: '/products', params: { sort: 'discount' } })}
      />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const c = useColors();
  const home = hooks.useHome();
  const authed = useAuth((s) => s.status === 'authed');
  const unread = hooks.useUnreadCount({ enabled: authed });
  const d = home.data;

  return (
    <Screen
      scroll
      refreshing={home.isRefetching}
      onRefresh={() => void home.refetch()}
      contentClassName="gap-6 pb-8"
    >
      <View className="flex-row items-center gap-2 px-4 pt-2">
        <Pressable
          onPress={() => router.push('/search')}
          accessibilityRole="search"
          accessibilityLabel="Search products"
          className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3"
        >
          <Icon name="search" size={18} color={c.mutedForeground} />
          <Text className="text-sm text-muted-foreground">Search products, brands and more</Text>
        </Pressable>
        <IconButton
          name="notifications-outline"
          label="Notifications"
          badge={unread.data?.count}
          onPress={() => router.push(authed ? '/notifications' : '/auth/login')}
        />
      </View>

      {home.isLoading ? (
        <View className="gap-4 px-4">
          <Skeleton className="aspect-[16/8] w-full" />
          <View className="flex-row gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="size-16 rounded-full" />
            ))}
          </View>
          <Skeleton className="h-48 w-full" />
        </View>
      ) : home.isError || !d ? (
        <ErrorState onRetry={() => void home.refetch()} />
      ) : (
        <>
          <Hero banners={d.banners} />
          <CategoryStrip categories={d.categories} />
          <DealsRail endsAt={d.deals.endsAt} products={d.deals.products} />
          <ProductRail
            title="Trending now"
            products={d.trending}
            action="See all"
            onAction={() => router.push({ pathname: '/products', params: { sort: 'popularity' } })}
          />
          {d.secondaryBanners.length ? (
            <View className="flex-row gap-3 px-4">
              {d.secondaryBanners.slice(0, 2).map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => openLink(router, b.linkUrl)}
                  accessibilityRole="link"
                  accessibilityLabel={b.title}
                  className="aspect-[4/3] flex-1 overflow-hidden rounded-2xl bg-muted"
                >
                  <Image
                    source={{ uri: imageUrl(b.mobileImageUrl ?? b.imageUrl) }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                  <View className="absolute inset-0 justify-end bg-black/25 p-3">
                    <Text className="text-sm font-bold text-white" numberOfLines={2}>
                      {b.title}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ProductRail title="Best sellers" products={d.bestSellers} />
          <ProductRail
            title="New arrivals"
            products={d.newArrivals}
            action="See all"
            onAction={() => router.push({ pathname: '/products', params: { sort: 'newest' } })}
          />
          {d.featured.map((f) => (
            <ProductRail
              key={f.category.id}
              title={f.category.name}
              products={f.products}
              action="View all"
              onAction={() =>
                router.push({ pathname: '/products', params: { category: f.category.slug } })
              }
            />
          ))}
          <ProductRail title="Top rated" products={d.topRated} />
          <View className="px-4">
            <SectionHeader title="Shop with confidence" className="px-0" />
            <Text className="mt-1 text-sm leading-5 text-muted-foreground">
              Verified sellers, GST invoices on every order, easy returns and secure payments.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}
