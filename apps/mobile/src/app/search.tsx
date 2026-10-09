import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { hooks } from '@/lib/api';
import { formatINR, imageUrl } from '@/lib/format';
import { recentSearches } from '@/lib/storage';
import { useColors } from '@/lib/theme';
import { Chip, Icon, IconButton, Screen } from '@/components/ui';

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SearchScreen() {
  const router = useRouter();
  const c = useColors();
  const [text, setText] = useState('');
  const debounced = useDebounced(text.trim());
  const suggest = hooks.useSuggest(debounced);
  const popular = hooks.usePopularSearches();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    void recentSearches.get().then(setRecent);
  }, []);

  const go = (q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    void recentSearches.add(t);
    router.push({ pathname: '/products', params: { q: t } });
  };

  const s = suggest.data;
  const typing = debounced.length >= 2;

  return (
    <Screen>
      <View className="h-14 flex-row items-center gap-1 px-2">
        <IconButton name="chevron-back" label="Go back" onPress={() => router.back()} />
        <View className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Icon name="search" size={18} color={c.mutedForeground} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => go(text)}
            returnKeyType="search"
            placeholder="Search products, brands and more"
            placeholderTextColor={c.mutedForeground}
            accessibilityLabel="Search"
            className="flex-1 text-base text-foreground"
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Clear">
              <Icon name="close-circle" size={18} color={c.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 p-4 pb-10">
        {typing && s ? (
          <>
            {s.queries.map((q) => (
              <Pressable key={q} onPress={() => go(q)} className="flex-row items-center gap-3">
                <Icon name="search-outline" size={18} color={c.mutedForeground} />
                <Text className="flex-1 text-base text-foreground">{q}</Text>
                <Icon name="arrow-up-outline" size={16} color={c.mutedForeground} />
              </Pressable>
            ))}
            {s.categories.length ? (
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Categories
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {s.categories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      icon="grid-outline"
                      onPress={() =>
                        router.push({ pathname: '/products', params: { category: cat.slug } })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {s.brands.length ? (
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Brands
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {s.brands.map((b) => (
                    <Chip
                      key={b.id}
                      label={b.name}
                      onPress={() =>
                        router.push({ pathname: '/products', params: { brand: b.slug } })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {s.products.length ? (
              <View className="gap-3">
                <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Products
                </Text>
                {s.products.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      router.push({ pathname: '/products/[slug]', params: { slug: p.slug } })
                    }
                    className="flex-row items-center gap-3"
                    accessibilityRole="link"
                  >
                    <View className="size-14 overflow-hidden rounded-lg bg-muted">
                      <Image
                        source={{ uri: imageUrl(p.image) }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Text className="text-xs text-muted-foreground">in {p.category}</Text>
                    </View>
                    <Text className="text-sm font-bold text-foreground">{formatINR(p.price)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {!s.queries.length && !s.products.length && !s.categories.length && !s.brands.length ? (
              <Text className="text-center text-muted-foreground">
                No suggestions. Press search to try anyway.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {recent.length ? (
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Recent searches
                  </Text>
                  <Pressable
                    onPress={() => {
                      void recentSearches.clear();
                      setRecent([]);
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-semibold text-primary">Clear</Text>
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {recent.map((q) => (
                    <Chip key={q} label={q} icon="time-outline" onPress={() => go(q)} />
                  ))}
                </View>
              </View>
            ) : null}
            {popular.data?.length ? (
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Popular right now
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {popular.data.map((q) => (
                    <Chip key={q} label={q} icon="trending-up" onPress={() => go(q)} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
