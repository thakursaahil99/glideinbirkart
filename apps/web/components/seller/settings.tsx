'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { ImageUploader } from '@/components/store/image-uploader';
import { PageHeader } from '@/components/dashboard/common';

export function SellerSettings() {
  const qc = useQueryClient();
  const { data: p, isLoading } = useQuery({
    queryKey: ['seller-profile'],
    queryFn: () => api.seller.profile(),
  });
  const [desc, setDesc] = useState('');
  const [logo, setLogo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (p) {
      setDesc(p.description ?? '');
      setLogo(p.logoUrl ? [p.logoUrl] : []);
    }
  }, [p]);
  if (isLoading || !p) return <Skeleton className="h-96" />;
  const rows: Array<[string, string]> = [
    ['Store', p.storeName],
    ['Business', p.businessName ?? '—'],
    ['GSTIN', p.gstin ?? '—'],
    ['PAN', p.pan ?? '—'],
    [
      'Bank',
      `${p.bankName ?? '—'} · ${p.bankAccountNumber ? `••••${p.bankAccountNumber.slice(-4)}` : '—'}`,
    ],
    ['IFSC', p.bankIfsc ?? '—'],
    [
      'Pickup address',
      [p.pickupLine1, p.pickupCity, p.pickupState, p.pickupPincode].filter(Boolean).join(', ') ||
        '—',
    ],
  ];
  return (
    <>
      <PageHeader
        title="Store settings"
        description="Your public storefront details. Legal and bank details are locked after approval — contact support to change them."
        actions={<StatusBadge status={p.status} />}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Public profile</CardTitle>
            <CardDescription>Appears on your product pages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Store logo">
              <ImageUploader
                folder="avatars"
                max={1}
                value={logo}
                onChange={setLogo}
                label="Logo"
              />
            </Field>
            <Field label="About your store" htmlFor="desc">
              <Textarea
                id="desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={1000}
              />
            </Field>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.seller.updateSettings({ description: desc, logoUrl: logo[0] ?? '' });
                  toast.success('Store profile updated');
                  void qc.invalidateQueries({ queryKey: ['seller-profile'] });
                } catch (e) {
                  toast.error(errMsg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save changes
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Business details</CardTitle>
            <CardDescription>Verified by our team.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
                  <dt className="font-semibold text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
