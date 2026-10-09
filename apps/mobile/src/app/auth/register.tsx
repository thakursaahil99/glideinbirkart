import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@gk/validators';
import { api } from '@/lib/api';
import { errMsg, fieldErrors } from '@/lib/format';
import { completeAuth } from '@/lib/session';
import { AuthShell } from '@/components/auth-shell';
import { FormField } from '@/components/form';
import { Button } from '@/components/ui';
import { useAfterAuth } from './login';

export default function RegisterScreen() {
  const done = useAfterAuth();
  const { control, handleSubmit } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<Record<string, string>>({});

  const submit = handleSubmit(async (v) => {
    setBusy(true);
    setError(null);
    setServer({});
    try {
      await completeAuth(await api.auth.register({ ...v, phone: v.phone || undefined }));
      done();
    } catch (e) {
      setServer(fieldErrors(e));
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join to track orders and get member-only deals"
    >
      <View className="gap-4">
        <FormField
          control={control}
          name="name"
          label="Full name"
          placeholder="As on your ID"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          serverError={server.name}
        />
        <FormField
          control={control}
          name="email"
          label="Email"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          serverError={server.email}
        />
        <FormField
          control={control}
          name="phone"
          label="Mobile number (optional)"
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          maxLength={10}
          serverError={server.phone}
        />
        <FormField
          control={control}
          name="password"
          label="Password"
          placeholder="Min 8 characters"
          password
          hint="Use at least one letter and one number."
          autoComplete="new-password"
          textContentType="newPassword"
          serverError={server.password}
          onSubmitEditing={submit}
        />
        {error ? (
          <Text className="text-sm font-medium text-destructive" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button title="Create account" size="lg" loading={busy} onPress={submit} />
        <View className="flex-row justify-center gap-1">
          <Text className="text-sm text-muted-foreground">Already have an account?</Text>
          <Link href="/auth/login" replace>
            <Text className="text-sm font-bold text-primary">Log in</Text>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
