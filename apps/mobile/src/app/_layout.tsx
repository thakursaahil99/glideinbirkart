import '../../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/lib/query';
import { useAuth } from '@/lib/auth-store';
import { bootstrapAuth } from '@/lib/session';
import { initGuestCartId, storage } from '@/lib/storage';
import { registerForPush } from '@/lib/push';
import { useColors, useThemeStyle } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

/** Notification payloads carry `orderId` / `productSlug` / `returnId`; tapping one opens the matching screen. */
function useNotificationLinks() {
  const router = useRouter();
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      if (!data) return router.push('/notifications');
      if (typeof data.orderId === 'string')
        return router.push({ pathname: '/orders/[id]', params: { id: data.orderId } });
      if (typeof data.productSlug === 'string')
        return router.push({ pathname: '/products/[slug]', params: { slug: data.productSlug } });
      if (typeof data.returnId === 'string') return router.push('/returns');
      router.push('/notifications');
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data as Record<string, unknown> | undefined),
    );
    return () => sub.remove();
  }, [router]);
}

function Shell({ needsOnboarding }: { needsOnboarding: boolean }) {
  const c = useColors();
  const themeStyle = useThemeStyle();
  const router = useRouter();
  const status = useAuth((s) => s.status);
  useNotificationLinks();

  useEffect(() => {
    if (needsOnboarding) router.replace('/onboarding');
  }, [needsOnboarding, router]);

  useEffect(() => {
    if (status === 'authed') void registerForPush();
  }, [status]);

  return (
    <View style={[{ flex: 1 }, themeStyle]}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="auth"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      await initGuestCartId();
      await bootstrapAuth();
      setNeedsOnboarding(!(await storage.get('gk_onboarded')));
      setReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <Shell needsOnboarding={needsOnboarding} />
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
