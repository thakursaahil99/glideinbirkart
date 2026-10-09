'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Building2,
  Check,
  Clock,
  Landmark,
  MapPin,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { sellerBankSchema, sellerBusinessSchema, sellerPickupSchema } from '@gk/validators';
import { INDIAN_STATE_NAMES } from '@gk/utils';
import type { KycDocType, SellerProfileDto } from '@gk/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { applyApiError, errMsg, useZodForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Badge, Skeleton, StatusBadge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { ImageUploader } from '@/components/store/image-uploader';
import { Logo } from '@/components/layout/logo';

const STEPS = [
  { label: 'Business', icon: Building2 },
  { label: 'Bank', icon: Landmark },
  { label: 'Pickup', icon: MapPin },
  { label: 'KYC', icon: ShieldCheck },
  { label: 'Review', icon: BadgeCheck },
];

const KYC_DOCS: Array<{ type: KycDocType; label: string; required: boolean; hint: string }> = [
  { type: 'PAN', label: 'PAN card', required: true, hint: 'Of the business owner / entity' },
  {
    type: 'GSTIN_CERTIFICATE',
    label: 'GST registration certificate',
    required: true,
    hint: 'Certificate showing your GSTIN',
  },
  {
    type: 'BANK_PROOF',
    label: 'Cancelled cheque / bank statement',
    required: true,
    hint: 'Must match the bank account entered',
  },
  {
    type: 'ID_PROOF',
    label: 'Owner ID proof (Aadhaar / passport)',
    required: false,
    hint: 'Optional but speeds up approval',
  },
];

function BusinessStep({
  profile,
  onDone,
  create,
}: {
  profile: SellerProfileDto | null;
  onDone: (p: SellerProfileDto) => void;
  create: boolean;
}) {
  const form = useZodForm(sellerBusinessSchema, {
    defaultValues: {
      storeName: profile?.storeName ?? '',
      description: profile?.description ?? '',
      businessName: profile?.businessName ?? '',
      businessType: (profile?.businessType as 'PROPRIETORSHIP') ?? 'PROPRIETORSHIP',
      gstin: profile?.gstin ?? '',
      pan: profile?.pan ?? '',
      contactEmail: profile?.contactEmail ?? '',
      contactPhone: profile?.contactPhone ?? '',
    },
  });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (v) => {
        try {
          onDone(create ? await api.seller.apply(v) : await api.seller.saveBusiness(v));
        } catch (err) {
          applyApiError(form, err);
        }
      })}
    >
      <Field
        label="Store name"
        htmlFor="storeName"
        error={e.storeName?.message}
        required
        hint="Shown to customers"
      >
        <Input id="storeName" {...form.register('storeName')} />
      </Field>
      <Field
        label="Registered business name"
        htmlFor="businessName"
        error={e.businessName?.message}
        required
      >
        <Input id="businessName" {...form.register('businessName')} />
      </Field>
      <Field label="Business type" htmlFor="businessType" required>
        <Select id="businessType" {...form.register('businessType')}>
          {['INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP'].map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="GSTIN"
        htmlFor="gstin"
        error={e.gstin?.message}
        required
        hint="15 characters, e.g. 29ABCDE1234F1Z5"
      >
        <Input id="gstin" maxLength={15} className="uppercase" {...form.register('gstin')} />
      </Field>
      <Field label="PAN" htmlFor="pan" error={e.pan?.message} required hint="e.g. ABCDE1234F">
        <Input id="pan" maxLength={10} className="uppercase" {...form.register('pan')} />
      </Field>
      <Field label="Contact phone" htmlFor="contactPhone" error={e.contactPhone?.message} required>
        <Input id="contactPhone" inputMode="numeric" {...form.register('contactPhone')} />
      </Field>
      <Field
        label="Contact email"
        htmlFor="contactEmail"
        error={e.contactEmail?.message}
        required
        className="sm:col-span-2"
      >
        <Input id="contactEmail" type="email" {...form.register('contactEmail')} />
      </Field>
      <Field
        label="About your store"
        htmlFor="description"
        error={e.description?.message}
        className="sm:col-span-2"
      >
        <Textarea id="description" maxLength={1000} {...form.register('description')} />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="sm:col-span-2"
        loading={form.formState.isSubmitting}
      >
        Save & continue
      </Button>
    </form>
  );
}

function BankStep({
  profile,
  onDone,
}: {
  profile: SellerProfileDto;
  onDone: (p: SellerProfileDto) => void;
}) {
  const form = useZodForm(sellerBankSchema, {
    defaultValues: {
      bankAccountName: profile.bankAccountName ?? profile.businessName ?? '',
      bankAccountNumber: profile.bankAccountNumber ?? '',
      bankIfsc: profile.bankIfsc ?? '',
      bankName: profile.bankName ?? '',
    },
  });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (v) => {
        try {
          onDone(await api.seller.saveBank(v));
        } catch (err) {
          applyApiError(form, err);
        }
      })}
    >
      <Field
        label="Account holder name"
        htmlFor="bankAccountName"
        error={e.bankAccountName?.message}
        required
        className="sm:col-span-2"
      >
        <Input id="bankAccountName" {...form.register('bankAccountName')} />
      </Field>
      <Field
        label="Account number"
        htmlFor="bankAccountNumber"
        error={e.bankAccountNumber?.message}
        required
      >
        <Input
          id="bankAccountNumber"
          inputMode="numeric"
          autoComplete="off"
          {...form.register('bankAccountNumber')}
        />
      </Field>
      <Field
        label="IFSC code"
        htmlFor="bankIfsc"
        error={e.bankIfsc?.message}
        required
        hint="e.g. HDFC0001234"
      >
        <Input id="bankIfsc" className="uppercase" maxLength={11} {...form.register('bankIfsc')} />
      </Field>
      <Field
        label="Bank name"
        htmlFor="bankName"
        error={e.bankName?.message}
        required
        className="sm:col-span-2"
      >
        <Input id="bankName" {...form.register('bankName')} />
      </Field>
      <p className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground sm:col-span-2">
        Payouts are settled to this account after the return window. The name must match your bank
        proof.
      </p>
      <Button
        type="submit"
        size="lg"
        className="sm:col-span-2"
        loading={form.formState.isSubmitting}
      >
        Save & continue
      </Button>
    </form>
  );
}

function PickupStep({
  profile,
  onDone,
}: {
  profile: SellerProfileDto;
  onDone: (p: SellerProfileDto) => void;
}) {
  const form = useZodForm(sellerPickupSchema, {
    defaultValues: {
      pickupLine1: profile.pickupLine1 ?? '',
      pickupLine2: profile.pickupLine2 ?? '',
      pickupCity: profile.pickupCity ?? '',
      pickupState: profile.pickupState ?? '',
      pickupPincode: profile.pickupPincode ?? '',
    },
  });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (v) => {
        try {
          onDone(await api.seller.savePickup(v));
        } catch (err) {
          applyApiError(form, err);
        }
      })}
    >
      <Field
        label="Address line 1"
        htmlFor="pickupLine1"
        error={e.pickupLine1?.message}
        required
        className="sm:col-span-2"
      >
        <Input id="pickupLine1" {...form.register('pickupLine1')} />
      </Field>
      <Field label="Address line 2" htmlFor="pickupLine2" className="sm:col-span-2">
        <Input id="pickupLine2" {...form.register('pickupLine2')} />
      </Field>
      <Field label="City" htmlFor="pickupCity" error={e.pickupCity?.message} required>
        <Input id="pickupCity" {...form.register('pickupCity')} />
      </Field>
      <Field
        label="State"
        htmlFor="pickupState"
        error={e.pickupState?.message}
        required
        hint="Determines CGST/SGST vs IGST on invoices"
      >
        <Select id="pickupState" {...form.register('pickupState')}>
          <option value="">Select state</option>
          {INDIAN_STATE_NAMES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <Field label="PIN code" htmlFor="pickupPincode" error={e.pickupPincode?.message} required>
        <Input
          id="pickupPincode"
          inputMode="numeric"
          maxLength={6}
          {...form.register('pickupPincode')}
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="sm:col-span-2"
        loading={form.formState.isSubmitting}
      >
        Save & continue
      </Button>
    </form>
  );
}

function KycStep({
  profile,
  onChange,
  onNext,
}: {
  profile: SellerProfileDto;
  onChange: (p: SellerProfileDto) => void;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = async () => onChange(await api.seller.profile());
  const attach = async (type: KycDocType, urls: string[]) => {
    const url = urls[urls.length - 1];
    if (!url) return;
    setBusy(type);
    try {
      await api.seller.addKyc({ docType: type, fileUrl: url, fileName: url.split('/').pop() });
      await refresh();
      toast.success('Document uploaded');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const ready = KYC_DOCS.filter((d) => d.required).every((d) =>
    profile.kycDocuments.some((k) => k.docType === d.type),
  );
  return (
    <div className="space-y-4">
      {KYC_DOCS.map((d) => {
        const doc = profile.kycDocuments.find((k) => k.docType === d.type);
        return (
          <div key={d.type} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-bold">
                {d.label}{' '}
                {d.required ? (
                  <Badge variant="deal">Required</Badge>
                ) : (
                  <Badge variant="muted">Optional</Badge>
                )}
                {doc && <StatusBadge status={doc.status} />}
              </p>
              <p className="text-xs text-muted-foreground">{d.hint}</p>
              {doc?.remarks && (
                <p className="mt-1 text-xs font-medium text-destructive">Reviewer: {doc.remarks}</p>
              )}
            </div>
            <ImageUploader
              folder="kyc"
              max={1}
              allowPdf
              label={busy === d.type ? 'Saving' : doc ? 'Replace' : 'Upload'}
              value={[]}
              onChange={(urls) => attach(d.type, urls)}
            />
            {doc && (
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary hover:underline"
              >
                View uploaded file
              </a>
            )}
          </div>
        );
      })}
      <Button size="lg" className="w-full" disabled={!ready} onClick={onNext}>
        Continue to review
      </Button>
      {!ready && (
        <p className="text-center text-xs text-muted-foreground">
          Upload the three required documents to continue.
        </p>
      )}
    </div>
  );
}

function ReviewStep({
  profile,
  onSubmitted,
}: {
  profile: SellerProfileDto;
  onSubmitted: (p: SellerProfileDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const rows: Array<[string, string]> = [
    ['Store', profile.storeName],
    [
      'Business',
      `${profile.businessName ?? ''} (${(profile.businessType ?? '').replace('_', ' ')})`,
    ],
    ['GSTIN / PAN', `${profile.gstin ?? ''} / ${profile.pan ?? ''}`],
    [
      'Bank',
      `${profile.bankName ?? '—'} · ${profile.bankAccountNumber ? `••••${profile.bankAccountNumber.slice(-4)}` : '—'} · ${profile.bankIfsc ?? ''}`,
    ],
    [
      'Pickup',
      [profile.pickupLine1, profile.pickupCity, profile.pickupState, profile.pickupPincode]
        .filter(Boolean)
        .join(', '),
    ],
    ['KYC documents', `${profile.kycDocuments.length} uploaded`],
  ];
  return (
    <div className="space-y-5">
      <dl className="divide-y rounded-2xl border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-3">
            <dt className="font-semibold text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Button
        size="lg"
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onSubmitted(await api.seller.submit());
            toast.success('Application submitted for review');
          } catch (e) {
            toast.error(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Submit for approval
      </Button>
    </div>
  );
}

export function OnboardingWizard() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const qc = useQueryClient();
  const isSeller = user?.role === 'SELLER';
  const { data: fetched, isLoading } = useQuery({
    queryKey: ['seller-profile'],
    queryFn: () => api.seller.profile(),
    enabled: isSeller,
  });
  const [profile, setProfile] = useState<SellerProfileDto | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (fetched) {
      setProfile(fetched);
      setStep((s) => (s === 0 ? Math.min(Math.max(fetched.onboardingStep - 1, 0), 4) : s));
    }
  }, [fetched]);

  const update = async (p: SellerProfileDto, next: number) => {
    setProfile(p);
    qc.setQueryData(['seller-profile'], p);
    if (!isSeller) {
      // the account was upgraded to SELLER on the server; refresh our copy of the user
      setUser(await api.users.me());
    }
    setStep(next);
  };

  if (isSeller && isLoading) return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  const locked = profile && ['PENDING', 'APPROVED', 'SUSPENDED'].includes(profile.status);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 text-center">
        <Store className="mx-auto mb-3 size-10 text-primary" />
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          Sell on Glideinbir Kart
        </h1>
        <p className="mt-2 text-muted-foreground">
          Reach customers across India. Set up your store in five quick steps.
        </p>
      </div>

      {profile?.status === 'REJECTED' && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <XCircle className="size-5 shrink-0 text-destructive" />
          <div>
            <b>Application needs changes</b>
            <p className="text-muted-foreground">
              {profile.adminRemarks ?? 'Please review your details and resubmit.'}
            </p>
          </div>
        </div>
      )}

      {locked ? (
        <div className="rounded-3xl border bg-card p-8 text-center shadow-soft">
          {profile.status === 'PENDING' ? (
            <Clock className="mx-auto mb-3 size-10 text-warning" />
          ) : (
            <BadgeCheck className="mx-auto mb-3 size-10 text-success" />
          )}
          <h2 className="font-display text-2xl font-extrabold">
            {profile.status === 'PENDING'
              ? 'Application under review'
              : profile.status === 'APPROVED'
                ? 'You’re approved!'
                : 'Account suspended'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {profile.status === 'PENDING'
              ? 'We’re verifying your documents. You’ll get an email and an in-app notification once a decision is made.'
              : profile.status === 'APPROVED'
                ? 'Your store is live. Start by adding your first product.'
                : (profile.adminRemarks ?? 'Please contact support.')}
          </p>
          {profile.status === 'APPROVED' && (
            <Button asChild size="lg" className="mt-6">
              <Link href="/seller/products/new">Add your first product</Link>
            </Button>
          )}
          {profile.status === 'PENDING' && (
            <Button asChild variant="outline" className="mt-6">
              <Link href="/">Back to store</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <ol className="mb-6 flex items-center justify-between gap-1" aria-label="Progress">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step || (profile && profile.onboardingStep > i + 1 && i < step);
              const reachable = !!profile && i <= Math.max(profile.onboardingStep - 1, 0);
              return (
                <li key={s.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!reachable && i !== 0}
                    onClick={() => reachable && setStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={cn(
                      'grid size-11 place-content-center rounded-full border-2 transition-all disabled:cursor-not-allowed',
                      i === step
                        ? 'border-primary bg-primary text-primary-foreground shadow-lift'
                        : done
                          ? 'border-success bg-success text-success-foreground'
                          : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-5" /> : <Icon className="size-5" />}
                  </button>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      i === step ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
            {step === 0 && (
              <BusinessStep profile={profile} create={!profile} onDone={(p) => update(p, 1)} />
            )}
            {step === 1 && profile && <BankStep profile={profile} onDone={(p) => update(p, 2)} />}
            {step === 2 && profile && <PickupStep profile={profile} onDone={(p) => update(p, 3)} />}
            {step === 3 && profile && (
              <KycStep profile={profile} onChange={setProfile} onNext={() => setStep(4)} />
            )}
            {step === 4 && profile && (
              <ReviewStep
                profile={profile}
                onSubmitted={(p) => {
                  setProfile(p);
                  qc.setQueryData(['seller-profile'], p);
                }}
              />
            )}
            {step > 0 && !profile && (
              <p className="text-sm text-muted-foreground">
                Start with your business details first.
              </p>
            )}
          </div>
          {step > 0 && step < 5 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="mx-auto mt-4 block text-sm font-semibold text-primary hover:underline"
            >
              ← Back
            </button>
          )}
        </>
      )}
      <div className="mt-8 flex justify-center">
        <Logo compact className="opacity-60" />
      </div>
    </div>
  );
}
