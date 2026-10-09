import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { IconButton, Screen } from './ui';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="h-12 flex-row px-2">
          <IconButton
            name="close"
            label="Close"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
        <Screen scroll edges={[]} contentClassName="gap-5 px-6 pb-10 pt-2">
          <View className="gap-1">
            <Text className="text-3xl font-extrabold text-foreground" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text className="text-base text-muted-foreground">{subtitle}</Text> : null}
          </View>
          {children}
        </Screen>
      </KeyboardAvoidingView>
    </Screen>
  );
}
