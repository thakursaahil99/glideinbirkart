import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import { AuthShell } from '@/components/auth-shell';
import { Button, Field } from '@/components/ui';

export default function ForgotScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="We will email you a link to choose a new password">
      {sent ? (
        <View className="gap-4">
          <View className="rounded-2xl bg-success/10 p-4">
            <Text className="text-sm leading-5 text-foreground">
              If an account exists for {email.trim()}, a reset link is on its way. Open it on any
              device to set a new password, then log in here.
            </Text>
          </View>
          <Button title="Back to login" onPress={() => router.replace('/auth/login')} />
        </View>
      ) : (
        <View className="gap-4">
          <Field
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            onSubmitEditing={submit}
          />
          {error ? <Text className="text-sm font-medium text-destructive">{error}</Text> : null}
          <Button
            title="Send reset link"
            size="lg"
            loading={busy}
            disabled={!email.includes('@')}
            onPress={submit}
          />
        </View>
      )}
    </AuthShell>
  );
}
