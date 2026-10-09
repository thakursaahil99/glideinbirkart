import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { hooks } from '@/lib/api';
import { imageUrl } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ErrorState, Icon, Screen, Spinner } from '@/components/ui';
import { useColors } from '@/lib/theme';

/** Two-pane browser: root categories on the left, their children as tiles on the right. */
export default function CategoriesScreen() {
  const router = useRouter();
  const c = useColors();
  const cats = hooks.useCategories();
  const [selected, setSelected] = useState<string | null>(null);
  const roots = cats.data ?? [];
  const active = roots.find((r) => r.id === selected) ?? roots[0];

  const open = (slug: string) => router.push({ pathname: '/products', params: { category: slug } });

  return (
    <Screen>
      <View className="h-14 justify-center border-b border-border px-4">
        <Text className="text-xl font-extrabold text-foreground" accessibilityRole="header">
          Categories
        </Text>
      </View>
      {cats.isLoading ? (
        <Spinner />
      ) : cats.isError ? (
        <ErrorState onRetry={() => void cats.refetch()} />
      ) : (
        <View className="flex-1 flex-row">
          <ScrollView
            className="w-28 border-r border-border bg-muted/50"
            showsVerticalScrollIndicator={false}
          >
            {roots.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setSelected(r.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: r.id === active?.id }}
                className={cn(
                  'items-center gap-1.5 border-l-4 px-2 py-3.5',
                  r.id === active?.id ? 'border-primary bg-card' : 'border-transparent',
                )}
              >
                <View className="size-11 overflow-hidden rounded-full bg-secondary">
                  {r.imageUrl ? (
                    <Image
                      source={{ uri: imageUrl(r.imageUrl) }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  ) : null}
                </View>
                <Text
                  className={cn(
                    'text-center text-xs',
                    r.id === active?.id ? 'font-bold text-primary' : 'font-medium text-foreground',
                  )}
                  numberOfLines={2}
                >
                  {r.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4 gap-4"
            showsVerticalScrollIndicator={false}
          >
            {active ? (
              <>
                <Pressable
                  onPress={() => open(active.slug)}
                  className="flex-row items-center justify-between rounded-xl bg-secondary px-4 py-3"
                >
                  <Text className="font-bold text-secondary-foreground">All in {active.name}</Text>
                  <Icon name="arrow-forward" size={18} color={c.primary} />
                </Pressable>
                {active.children?.map((child) => (
                  <View key={child.id} className="gap-2">
                    <Pressable onPress={() => open(child.slug)} accessibilityRole="link">
                      <Text className="text-base font-bold text-foreground">{child.name}</Text>
                    </Pressable>
                    {child.children?.length ? (
                      <View className="flex-row flex-wrap gap-2">
                        {child.children.map((g) => (
                          <Pressable
                            key={g.id}
                            onPress={() => open(g.slug)}
                            className="rounded-full border border-border bg-card px-3 py-1.5"
                            accessibilityRole="link"
                          >
                            <Text className="text-xs font-medium text-foreground">{g.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
                {!active.children?.length ? (
                  <Text className="text-sm text-muted-foreground">
                    Browse everything in {active.name} above.
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}
