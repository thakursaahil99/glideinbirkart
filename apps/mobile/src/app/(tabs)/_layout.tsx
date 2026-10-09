import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useColors } from '@/lib/theme';

type TabIcon = keyof typeof Ionicons.glyphMap;
const icon = (active: TabIcon, idle: TabIcon) =>
  function TabBarIcon({
    color,
    focused,
    size,
  }: {
    color: ColorValue;
    focused: boolean;
    size: number;
  }) {
    return <Ionicons name={focused ? active : idle} size={size} color={color} />;
  };

export default function TabsLayout() {
  const c = useColors();
  const cart = hooks.useCart();
  const authed = useAuth((s) => s.status === 'authed');
  const unread = hooks.useUnreadCount({ enabled: authed });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBadgeStyle: { backgroundColor: c.deal, color: '#fff', fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: 'Categories', tabBarIcon: icon('grid', 'grid-outline') }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: icon('cart', 'cart-outline'),
          tabBarBadge: cart.data?.itemCount || undefined,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{ title: 'Wishlist', tabBarIcon: icon('heart', 'heart-outline') }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: icon('person', 'person-outline'),
          tabBarBadge: unread.data?.count || undefined,
        }}
      />
    </Tabs>
  );
}
