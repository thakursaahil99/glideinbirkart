import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@gk/validators';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import { completeAuth } from '@/lib/session';
import { cn } from '@/lib/cn';
import { AuthShell } from '@/components/auth-shell';
import { FormField } from '@/components/form';
import { Button, Chip, Field } from '@/components/ui';

export function useAfterAuth() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  return () => {
    if (next) router.replace(next as never);
    else if (router.canGoBack()) router.dismissAll();
    else router.replace('/');
  };
}

function PasswordLogin({ onDone }: { onDone: () => void }) {
  const { control, handleSubmit } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = handleSubmit(async (v) => {
    setBusy(true);
    setError(null);
    try {
      await completeAuth(await api.auth.login(v));
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  });
  return (
    <View className="gap-4">
      <FormField
        control={control}
        name="email"
        label="Email"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <FormField
        control={control}
        name="password"
        label="Password"
        placeholder="Your password"
        password
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      {error ? (
        <Text className="text-sm font-medium text-destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button title="Log in" size="lg" loading={busy} onPress={submit} />
      <Link href="/auth/forgot" asChild>
        <Text className="text-center text-sm font-semibold text-primary">Forgot password?</Text>
      </Link>
    </View>
  );
}

function OtpLogin({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState<{ devOtp?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.requestOtp(phone.trim());
      setSent({ devOtp: r.devOtp });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeAuth(
        await api.auth.verifyOtp({
          phone: phone.trim(),
          code: code.trim(),
          name: name.trim() || undefined,
        }),
      );
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <Field
        label="Mobile number"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        maxLength={10}
        value={phone}
        onChangeText={setPhone}
        editable={!sent}
        autoComplete="tel"
      />
      {sent ? (
        <>
          <Field
            label="One-time password"
            placeholder="6-digit code"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            hint={sent.devOtp ? `Dev mode: your code is ${sent.devOtp}` : 'We sent a code by SMS.'}
          />
          <Field
            label="Your name (new accounts only)"
            placeholder="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </>
      ) : null}
      {error ? (
        <Text className="text-sm font-medium text-destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {sent ? (
        <Button
          title="Verify and continue"
          size="lg"
          loading={busy}
          disabled={code.length !== 6}
          onPress={verify}
        />
      ) : (
        <Button
          title="Send OTP"
          size="lg"
          loading={busy}
          disabled={phone.trim().length !== 10}
          onPress={request}
        />
      )}
      {sent ? (
        <Text
          className="text-center text-sm font-semibold text-primary"
          onPress={() => {
            setSent(null);
            setCode('');
          }}
        >
          Change number
        </Text>
      ) : null}
    </View>
  );
}

export default function LoginScreen() {
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const done = useAfterAuth();
  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue shopping">
      <View className="flex-row gap-2">
        <Chip
          label="Email"
          selected={mode === 'password'}
          onPress={() => setMode('password')}
          icon="mail-outline"
        />
        <Chip
          label="Mobile OTP"
          selected={mode === 'otp'}
          onPress={() => setMode('otp')}
          icon="phone-portrait-outline"
        />
      </View>
      {mode === 'password' ? <PasswordLogin onDone={done} /> : <OtpLogin onDone={done} />}
      <View className={cn('flex-row justify-center gap-1')}>
        <Text className="text-sm text-muted-foreground">New here?</Text>
        <Link href="/auth/register" replace>
          <Text className="text-sm font-bold text-primary">Create an account</Text>
        </Link>
      </View>
    </AuthShell>
  );
}
