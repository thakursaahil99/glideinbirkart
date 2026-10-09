'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, KeyRound, Mail, Phone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
} from '@gk/validators';
import type { AuthResult } from '@gk/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { applyApiError, errMsg, useZodForm } from '@/lib/forms';
import { safeNext } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/data';

function useAfterLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  return (res: AuthResult) => {
    setSession(res);
    toast.success(`Welcome${res.user.name ? `, ${res.user.name.split(' ')[0]}` : ''}!`);
    const fallback =
      res.user.role === 'SELLER'
        ? '/seller'
        : res.user.role === 'ADMIN' || res.user.role === 'SUPER_ADMIN'
          ? '/admin'
          : '/';
    router.replace(safeNext(params.get('next'), fallback));
    router.refresh();
  };
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function EmailLogin() {
  const afterLogin = useAfterLogin();
  const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });
  const { register, handleSubmit, formState } = form;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (v) => {
        try {
          afterLogin(await api.auth.login(v));
        } catch (e) {
          applyApiError(form, e, 'Could not sign in');
        }
      })}
    >
      <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!formState.errors.email}
          {...register('email')}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Your password"
          aria-invalid={!!formState.errors.password}
          {...register('password')}
        />
      </Field>
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

function OtpLogin() {
  const afterLogin = useAfterLogin();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ devOtp?: string; resendIn: number } | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const form = useZodForm(requestOtpSchema, { defaultValues: { phone: '' } });

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (p: string) => {
    setBusy(true);
    try {
      const res = await api.auth.requestOtp(p);
      setPhone(p);
      setSent(res);
      setWait(res.resendIn);
      toast.success('OTP sent to your mobile number');
    } catch (e) {
      toast.error(errMsg(e, 'Could not send OTP'));
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => send(v.phone))}>
        <Field
          label="Mobile number"
          htmlFor="phone"
          error={form.formState.errors.phone?.message}
          hint="We’ll text you a 6-digit code. New here? We’ll create your account."
        >
          <div className="flex gap-2">
            <span className="grid h-11 shrink-0 place-content-center rounded-xl border bg-muted px-3 text-sm font-semibold">
              +91
            </span>
            <Input
              id="phone"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              maxLength={14}
              aria-invalid={!!form.formState.errors.phone}
              {...form.register('phone')}
            />
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Send OTP
        </Button>
      </form>
    );
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          afterLogin(await api.auth.verifyOtp({ phone, code }));
        } catch (err) {
          toast.error(errMsg(err, 'Invalid code'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Enter the code sent to <strong className="text-foreground">+91 {phone}</strong>.{' '}
        <button
          type="button"
          className="font-semibold text-primary hover:underline"
          onClick={() => setSent(null)}
        >
          Change
        </button>
      </p>
      {sent.devOtp && (
        <p
          className="rounded-xl border border-dashed border-accent bg-accent/10 px-3 py-2 text-xs font-medium"
          data-testid="dev-otp"
        >
          Dev mode — no SMS gateway configured. Your OTP is{' '}
          <strong className="font-mono text-sm tracking-widest">{sent.devOtp}</strong>
        </p>
      )}
      <Field label="6-digit code" htmlFor="otp">
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center font-mono text-xl tracking-[0.6em]"
          placeholder="••••••"
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={code.length !== 6}
      >
        Verify & continue
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {wait > 0 ? (
          `Resend code in ${wait}s`
        ) : (
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => send(phone)}
          >
            Resend code
          </button>
        )}
      </p>
    </form>
  );
}

export function LoginForm() {
  return (
    <Tabs defaultValue="email">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="email">
          <Mail className="size-4" /> Email
        </TabsTrigger>
        <TabsTrigger value="phone">
          <Phone className="size-4" /> Phone OTP
        </TabsTrigger>
      </TabsList>
      <TabsContent value="email">
        <EmailLogin />
      </TabsContent>
      <TabsContent value="phone">
        <OtpLogin />
      </TabsContent>
    </Tabs>
  );
}

export function RegisterForm() {
  const afterLogin = useAfterLogin();
  const form = useZodForm(registerSchema, { defaultValues: { name: '', email: '', password: '' } });
  const { register, handleSubmit, formState } = form;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (v) => {
        try {
          const res = await api.auth.register(v);
          toast.info('We sent a verification link to your email');
          afterLogin(res);
        } catch (e) {
          applyApiError(form, e, 'Could not create your account');
        }
      })}
    >
      <Field label="Full name" htmlFor="name" error={formState.errors.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          placeholder="Aarav Sharma"
          aria-invalid={!!formState.errors.name}
          {...register('name')}
        />
      </Field>
      <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!formState.errors.email}
          {...register('email')}
        />
      </Field>
      <Field label="Mobile (optional)" htmlFor="phone" error={formState.errors.phone?.message}>
        <Input
          id="phone"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          {...register('phone', { setValueAs: (v: string) => (v ? v : undefined) })}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={formState.errors.password?.message}
        hint="At least 8 characters with a letter and a number"
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!formState.errors.password}
          {...register('password')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto mb-3 grid size-12 place-content-center rounded-full bg-success/15 text-success">
          <Mail className="size-6" />
        </div>
        <h2 className="font-display text-lg font-bold">Check your inbox</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          If an account exists for that email, we’ve sent a link to reset your password. It expires
          in 30 minutes.
        </p>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        try {
          await api.auth.forgotPassword(v.email);
          setDone(true);
        } catch (e) {
          applyApiError(form, e);
        }
      })}
    >
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const form = useZodForm(resetPasswordSchema, { defaultValues: { token, password: '' } });
  if (!token)
    return (
      <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
        This reset link is missing its token. Request a new one.
      </p>
    );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        try {
          await api.auth.resetPassword(v.token, v.password);
          toast.success('Password updated — please sign in');
          router.replace('/login');
        } catch (e) {
          applyApiError(form, e);
        }
      })}
    >
      <Field
        label="New password"
        htmlFor="password"
        error={form.formState.errors.password?.message}
        hint="At least 8 characters with a letter and a number"
      >
        <PasswordInput id="password" autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        <KeyRound /> Update password
      </Button>
    </form>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = useState('This verification link is invalid.');
  useEffect(() => {
    if (!token) return;
    api.auth
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch((e) => {
        setMessage(errMsg(e, 'This verification link is invalid or has expired.'));
        setState('error');
      });
  }, [token]);
  return (
    <div className="rounded-2xl border bg-card p-6 text-center">
      <div
        className={`mx-auto mb-3 grid size-12 place-content-center rounded-full ${state === 'ok' ? 'bg-success/15 text-success' : state === 'error' ? 'bg-destructive/12 text-destructive' : 'bg-muted'}`}
      >
        <ShieldCheck className="size-6" />
      </div>
      <h2 className="font-display text-lg font-bold">
        {state === 'loading'
          ? 'Verifying your email…'
          : state === 'ok'
            ? 'Email verified'
            : 'Verification failed'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {state === 'ok'
          ? 'Thanks! Your email address is confirmed.'
          : state === 'error'
            ? message
            : 'One moment…'}
      </p>
      <Button asChild className="mt-5">
        <Link href="/">Continue shopping</Link>
      </Button>
    </div>
  );
}
