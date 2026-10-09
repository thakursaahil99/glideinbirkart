import Link from 'next/link';
import { BadgeCheck, Gauge, Truck } from 'lucide-react';
import { Img } from '@/components/ui/img';
import { SiteName } from '@/components/site-theme';
import { Logo } from './logo';

/** Split-screen frame for sign-in / sign-up. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Img
          src="https://images.pexels.com/photos/6969947/pexels-photo-6969947.jpeg?auto=compress&cs=tinysrgb&w=1200&h=1600&fit=crop"
          alt=""
          aria-hidden
          fill
          sizes="50vw"
          priority
          className="object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-primary/80" />
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-accent/90"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-24 size-[30rem] rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="absolute right-16 top-1/2 size-40 rounded-full border-[18px] border-white/15"
        />
        <Logo className="relative [&_span]:text-white [&_span_span]:text-white" />
        <div className="relative max-w-md space-y-6">
          <h2 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Everything you love, glided to your door.
          </h2>
          <ul className="space-y-3 text-[15px] text-white/85">
            <li className="flex items-center gap-3">
              <BadgeCheck className="size-5 text-accent" /> Verified sellers, GST-inclusive prices
            </li>
            <li className="flex items-center gap-3">
              <Truck className="size-5 text-accent" /> Fast delivery across India, COD available
            </li>
            <li className="flex items-center gap-3">
              <Gauge className="size-5 text-accent" /> 7-day easy returns on eligible items
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} <SiteName />
        </p>
      </aside>
      <main id="main" className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            By continuing you agree to our{' '}
            <Link href="/p/terms" className="underline underline-offset-2">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/p/privacy-policy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
