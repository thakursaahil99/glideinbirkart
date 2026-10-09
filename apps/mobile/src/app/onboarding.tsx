import { useRef, useState } from 'react';
import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, type IconName } from '@/components/ui';
import { storage } from '@/lib/storage';
import { useColors } from '@/lib/theme';

const SLIDES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'storefront-outline',
    title: 'Thousands of sellers, one cart',
    body: 'Shop from verified Indian sellers across fashion, electronics, home and more. All in one checkout.',
  },
  {
    icon: 'pricetags-outline',
    title: 'Prices that include GST',
    body: 'See the real price up front, with deals, coupons and free delivery thresholds clearly shown.',
  },
  {
    icon: 'cube-outline',
    title: 'Track every step',
    body: 'Pay with UPI, cards or cash on delivery. Follow your order live and return it easily.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);

  const finish = async () => {
    await storage.set('gk_onboarded', '1');
    router.replace('/(tabs)');
  };
  const last = index === SLIDES.length - 1;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-row justify-end px-4 pt-2">
        <Text
          className="p-2 text-sm font-semibold text-muted-foreground"
          onPress={finish}
          accessibilityRole="button"
        >
          Skip
        </Text>
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width }} className="flex-1 items-center justify-center gap-6 px-10">
            <View className="size-40 items-center justify-center rounded-full bg-secondary">
              <Icon name={item.icon} size={72} color={c.primary} />
            </View>
            <Text className="text-center text-3xl font-extrabold text-foreground">
              {item.title}
            </Text>
            <Text className="text-center text-base leading-6 text-muted-foreground">
              {item.body}
            </Text>
          </View>
        )}
      />
      <View className="gap-5 px-6">
        <View className="flex-row items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <View
              key={s.title}
              className={
                i === index ? 'h-2 w-6 rounded-full bg-primary' : 'size-2 rounded-full bg-border'
              }
            />
          ))}
        </View>
        <Button
          size="lg"
          title={last ? 'Start shopping' : 'Next'}
          onPress={() =>
            last ? finish() : list.current?.scrollToIndex({ index: index + 1, animated: true })
          }
        />
      </View>
    </View>
  );
}
