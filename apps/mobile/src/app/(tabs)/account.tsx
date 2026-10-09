import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { signOut } from '@/lib/session';
import { useColors, useSiteName } from '@/lib/theme';
import { Button, Card, Icon, Screen, type IconName } from '@/components/ui';

function MenuRow({
  icon,
  label,
  onPress,
  badge,
  last,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
  last?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-muted ${last ? '' : 'border-b border-border'}`}
    >
      <Icon name={icon} size={20} color={c.primary} />
      <Text className="flex-1 text-base text-foreground">{label}</Text>
      {badge ? (
        <View className="min-w-5 items-center rounded-full bg-deal px-1.5">
          <Text className="text-xs font-bold text-deal-foreground">{badge}</Text>
        </View>
      ) : null}
      <Icon name="chevron-forward" size={16} color={c.mutedForeground} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const siteName = useSiteName();
  const { status, user } = useAuth();
  const settings = hooks.useSettings();
  const pages = useQuery({
    queryKey: ['cms-list'],
    queryFn: () => api.cms.list(),
    staleTime: 300_000,
  });
  const unread = hooks.useUnreadCount({ enabled: status === 'authed' });
  const s = settings.data;

  const confirmLogout = () =>
    Alert.alert('Log out?', 'You will need to sign in again to see your orders.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen scroll contentClassName="gap-4 p-4 pb-10">
      <Text className="text-xl font-extrabold text-foreground" accessibilityRole="header">
        Account
      </Text>

      {status === 'authed' && user ? (
        <Card className="flex-row items-center gap-3">
          <View className="size-14 items-center justify-center rounded-full bg-primary">
            <Text className="text-2xl font-extrabold text-primary-foreground">
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
              {user.name}
            </Text>
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {user.email ?? user.phone}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
            <Text className="text-sm font-semibold text-primary">Edit</Text>
          </Pressable>
        </Card>
      ) : (
        <Card className="gap-3">
          <Text className="text-lg font-bold text-foreground">Welcome to {siteName}</Text>
          <Text className="text-sm text-muted-foreground">
            Log in to track orders, save addresses and get personal offers.
          </Text>
          <View className="flex-row gap-3">
            <Button title="Log in" className="flex-1" onPress={() => router.push('/auth/login')} />
            <Button
              title="Sign up"
              variant="outline"
              className="flex-1"
              onPress={() => router.push('/auth/register')}
            />
          </View>
        </Card>
      )}

      {status === 'authed' ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          <MenuRow icon="cube-outline" label="My orders" onPress={() => router.push('/orders')} />
          <MenuRow
            icon="return-down-back-outline"
            label="Returns and refunds"
            onPress={() => router.push('/returns')}
          />
          <MenuRow
            icon="location-outline"
            label="Saved addresses"
            onPress={() => router.push('/addresses')}
          />
          <MenuRow
            icon="notifications-outline"
            label="Notifications"
            badge={unread.data?.count}
            onPress={() => router.push('/notifications')}
          />
          <MenuRow
            icon="person-outline"
            label="Profile and security"
            onPress={() => router.push('/profile')}
            last
          />
        </View>
      ) : null}

      {pages.data?.length ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {pages.data.map((p, i) => (
            <MenuRow
              key={p.slug}
              icon="document-text-outline"
              label={p.title}
              onPress={() => router.push({ pathname: '/page/[slug]', params: { slug: p.slug } })}
              last={i === pages.data.length - 1}
            />
          ))}
        </View>
      ) : null}

      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        <MenuRow
          icon="help-circle-outline"
          label="Help and support"
          onPress={() =>
            void Linking.openURL(`mailto:${s?.supportEmail ?? 'support@glideinbirkart.in'}`)
          }
        />
        {s?.supportPhone ? (
          <MenuRow
            icon="call-outline"
            label={`Call ${s.supportPhone}`}
            onPress={() => void Linking.openURL(`tel:${s.supportPhone.replace(/\s/g, '')}`)}
            last
          />
        ) : null}
      </View>

      {status === 'authed' ? (
        <Button title="Log out" variant="outline" icon="log-out-outline" onPress={confirmLogout} />
      ) : null}
      <Text className="text-center text-xs text-muted-foreground">{siteName} v1.0.0</Text>
    </Screen>
  );
}
