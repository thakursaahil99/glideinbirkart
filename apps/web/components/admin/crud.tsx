'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  bannerInputSchema,
  couponInputSchema,
  serviceablePincodeSchema,
  type BannerOutput,
  type CouponOutput,
} from '@gk/validators';
import type {
  AdminBannerDto,
  AdminCouponDto,
  AttributeDto,
  BrandDto,
  ServiceablePincodeDto,
} from '@gk/types';
import { INDIAN_STATE_NAMES, formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { applyApiError, errMsg, useZodForm } from '@/lib/forms';
import { formatDate } from '@/lib/utils';
import { Badge, Skeleton, StatusBadge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { CheckRow, Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { ImageUploader } from '@/components/store/image-uploader';
import { ServerTable } from '@/components/dashboard/data-table';
import { PageHeader, ReasonDialog } from '@/components/dashboard/common';

const toLocalInput = (iso?: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';

// ───────────────────────── brands ─────────────────────────
export function BrandsAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.admin.brands.list(),
  });
  const [edit, setEdit] = useState<BrandDto | 'new' | null>(null);
  const [del, setDel] = useState<BrandDto | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [logo, setLogo] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const open = (b: BrandDto | 'new') => {
    setEdit(b);
    setName(b === 'new' ? '' : b.name);
    setDesc(b === 'new' ? '' : (b.description ?? ''));
    setLogo(b !== 'new' && b.logoUrl ? [b.logoUrl] : []);
    setActive(b === 'new' ? true : (b.isActive ?? true));
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-brands'] });
  };
  return (
    <>
      <PageHeader
        title="Brands"
        actions={
          <Button onClick={() => open('new')}>
            <Plus /> New brand
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(data ?? []).map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft"
            >
              <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border bg-muted">
                <Img src={b.logoUrl} alt="" fill sizes="56px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{b.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{b.slug}</p>
                {!b.isActive && <Badge variant="muted">Hidden</Badge>}
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit ${b.name}`}
                onClick={() => open(b)}
              >
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${b.name}`}
                onClick={() => setDel(b)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit === 'new' ? 'New brand' : 'Edit brand'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const body = { name, description: desc, logoUrl: logo[0] ?? '', isActive: active };
                if (edit === 'new') await api.admin.brands.create(body);
                else await api.admin.brands.update((edit as BrandDto).id, body);
                toast.success('Brand saved');
                setEdit(null);
                refresh();
              } catch (err) {
                toast.error(errMsg(err));
              }
            }}
          >
            <Field label="Name" htmlFor="b-name" required>
              <Input
                id="b-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
              />
            </Field>
            <Field label="Description" htmlFor="b-desc">
              <Textarea
                id="b-desc"
                rows={2}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </Field>
            <Field label="Logo">
              <ImageUploader folder="brands" max={1} value={logo} onChange={setLogo} label="Logo" />
            </Field>
            <CheckRow id="b-active" checked={active} onCheckedChange={setActive}>
              Active
            </CheckRow>
            <Button type="submit" className="w-full" disabled={!name.trim()}>
              Save brand
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.name}?`}
        description="Brands used by products can’t be deleted — deactivate them instead."
        confirmLabel="Delete"
        destructive
        requireReason={false}
        label=""
        onConfirm={async () => {
          await api.admin.brands.remove(del!.id);
          toast.success('Brand deleted');
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── attributes ─────────────────────────
export function AttributesAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['attributes-all'],
    queryFn: () => api.admin.attributes.list(),
  });
  const [edit, setEdit] = useState<AttributeDto | 'new' | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('SELECT');
  const [filterable, setFilterable] = useState(true);
  const [values, setValues] = useState('');
  const [del, setDel] = useState<AttributeDto | null>(null);
  const open = (a: AttributeDto | 'new') => {
    setEdit(a);
    setName(a === 'new' ? '' : a.name);
    setType(a === 'new' ? 'SELECT' : a.type);
    setFilterable(a === 'new' ? true : a.isFilterable);
    setValues(
      a === 'new' ? '' : a.values.map((v) => (v.hex ? `${v.value}|${v.hex}` : v.value)).join('\n'),
    );
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['attributes-all'] });
  };
  return (
    <>
      <PageHeader
        title="Attributes"
        description="Dynamic product attributes (colour, size, storage…). Attach them to categories as variant axes or specs."
        actions={
          <Button onClick={() => open('new')}>
            <Plus /> New attribute
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((a) => (
            <div key={a.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{a.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {a.slug} · {a.type.toLowerCase()}
                    {a.isFilterable ? ' · filterable' : ''}
                  </p>
                </div>
                <div className="flex">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${a.name}`}
                    onClick={() => open(a)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => setDel(a)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.values.slice(0, 12).map((v) => (
                  <span
                    key={v.id}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                  >
                    {v.hex && (
                      <span
                        className="size-3 rounded-full ring-1 ring-black/20"
                        style={{ background: v.hex }}
                      />
                    )}
                    {v.value}
                  </span>
                ))}
                {a.values.length > 12 && (
                  <span className="text-xs text-muted-foreground">
                    +{a.values.length - 12} more
                  </span>
                )}
                {a.values.length === 0 && (
                  <span className="text-xs text-muted-foreground">Free-form values</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit === 'new' ? 'New attribute' : 'Edit attribute'}</DialogTitle>
            <DialogDescription>One value per line. For colours use “Name|#hex”.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const vals = values
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => {
                  const [value, hex] = l.split('|');
                  return { value: (value ?? '').trim(), hex: hex?.trim() };
                });
              try {
                const body = { name, type, isFilterable: filterable, values: vals };
                if (edit === 'new') await api.admin.attributes.create(body);
                else await api.admin.attributes.update((edit as AttributeDto).id, body);
                toast.success('Attribute saved');
                setEdit(null);
                refresh();
              } catch (err) {
                toast.error(errMsg(err));
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="at-name" required>
                <Input
                  id="at-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Type" htmlFor="at-type">
                <Select id="at-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="SELECT">Select (list)</option>
                  <option value="COLOR">Colour</option>
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                </Select>
              </Field>
            </div>
            <Field label="Allowed values" htmlFor="at-values">
              <Textarea
                id="at-values"
                rows={7}
                value={values}
                onChange={(e) => setValues(e.target.value)}
                placeholder={'Red|#dc2626\nBlue|#2563eb'}
                className="font-mono text-xs"
              />
            </Field>
            <CheckRow id="at-filter" checked={filterable} onCheckedChange={setFilterable}>
              Show as a filter on listing pages
            </CheckRow>
            <Button type="submit" className="w-full" disabled={!name.trim()}>
              Save attribute
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.name}?`}
        description="Remove it from all categories first."
        confirmLabel="Delete"
        destructive
        requireReason={false}
        label=""
        onConfirm={async () => {
          await api.admin.attributes.remove(del!.id);
          toast.success('Attribute deleted');
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── banners ─────────────────────────
function BannerDialog({
  banner,
  onClose,
  onSaved,
}: {
  banner: AdminBannerDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useZodForm(bannerInputSchema, {
    defaultValues: banner
      ? {
          title: banner.title,
          subtitle: banner.subtitle ?? '',
          imageUrl: banner.imageUrl,
          mobileImageUrl: banner.mobileImageUrl ?? '',
          linkUrl: banner.linkUrl ?? '',
          ctaText: banner.ctaText ?? '',
          placement: banner.placement,
          sortOrder: banner.sortOrder,
          isActive: banner.isActive,
        }
      : {
          title: '',
          subtitle: '',
          imageUrl: '',
          mobileImageUrl: '',
          linkUrl: '/',
          ctaText: '',
          placement: 'HERO',
          sortOrder: 0,
          isActive: true,
        },
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{banner ? 'Edit banner' : 'New banner'}</DialogTitle>
          <DialogDescription>Desktop image ≈ 1600×560; mobile image ≈ 1000×700.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit(async (v) => {
            try {
              if (banner) await api.admin.banners.update(banner.id, v as BannerOutput);
              else await api.admin.banners.create(v as BannerOutput);
              toast.success('Banner saved');
              onSaved();
              onClose();
            } catch (err) {
              applyApiError(form, err);
            }
          })}
        >
          <Field label="Title" htmlFor="bn-t" error={e.title?.message} required>
            <Input id="bn-t" {...form.register('title')} />
          </Field>
          <Field label="Placement" htmlFor="bn-p">
            <Select id="bn-p" {...form.register('placement')}>
              <option value="HERO">Hero carousel</option>
              <option value="SECONDARY">Secondary strip</option>
              <option value="STRIP">Thin strip</option>
            </Select>
          </Field>
          <Field label="Subtitle" htmlFor="bn-s" className="sm:col-span-2">
            <Input id="bn-s" {...form.register('subtitle')} />
          </Field>
          <Field label="Desktop image" error={e.imageUrl?.message} required>
            <ImageUploader
              folder="banners"
              max={1}
              value={form.watch('imageUrl') ? [form.watch('imageUrl')] : []}
              onChange={(u) => form.setValue('imageUrl', u[0] ?? '', { shouldValidate: true })}
              label="Desktop"
            />
          </Field>
          <Field label="Mobile image">
            <ImageUploader
              folder="banners"
              max={1}
              value={form.watch('mobileImageUrl') ? [form.watch('mobileImageUrl') as string] : []}
              onChange={(u) => form.setValue('mobileImageUrl', u[0] ?? '')}
              label="Mobile"
            />
          </Field>
          <Field label="Link (path)" htmlFor="bn-l">
            <Input id="bn-l" placeholder="/c/electronics" {...form.register('linkUrl')} />
          </Field>
          <Field label="Button text" htmlFor="bn-c">
            <Input id="bn-c" {...form.register('ctaText')} />
          </Field>
          <Field label="Sort order" htmlFor="bn-o">
            <Input
              id="bn-o"
              type="number"
              min={0}
              {...form.register('sortOrder', { valueAsNumber: true })}
            />
          </Field>
          <div className="flex items-end">
            <CheckRow
              id="bn-a"
              checked={!!form.watch('isActive')}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            >
              Active
            </CheckRow>
          </div>
          <Button
            type="submit"
            size="lg"
            className="sm:col-span-2"
            loading={form.formState.isSubmitting}
          >
            Save banner
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BannersAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: () => api.admin.banners.list(),
  });
  const [edit, setEdit] = useState<AdminBannerDto | 'new' | null>(null);
  const [del, setDel] = useState<AdminBannerDto | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-banners'] });
  };
  return (
    <>
      <PageHeader
        title="Banners"
        description="Hero carousel and promo strips shown on the home page and in the mobile app."
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus /> New banner
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((b) => (
            <li key={b.id} className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              <div className="relative aspect-[16/6] bg-muted">
                <Img src={b.imageUrl} alt={b.title} fill sizes="50vw" className="object-cover" />
              </div>
              <div className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{b.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.placement} · order {b.sortOrder} · {b.linkUrl}
                  </p>
                </div>
                <StatusBadge status={b.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Edit ${b.title}`}
                  onClick={() => setEdit(b)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${b.title}`}
                  onClick={() => setDel(b)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <BannerDialog
          banner={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
      <ReasonDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete banner?"
        confirmLabel="Delete"
        destructive
        requireReason={false}
        label=""
        onConfirm={async () => {
          await api.admin.banners.remove(del!.id);
          toast.success('Banner deleted');
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── coupons ─────────────────────────
function CouponDialog({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: AdminCouponDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useZodForm(couponInputSchema, {
    defaultValues: coupon
      ? {
          code: coupon.code,
          description: coupon.description ?? '',
          type: coupon.type,
          value: coupon.value,
          minOrderAmount: coupon.minOrderAmount,
          maxDiscount: coupon.maxDiscount,
          usageLimit: coupon.usageLimit,
          perUserLimit: coupon.perUserLimit,
          startsAt: coupon.startsAt ? new Date(coupon.startsAt) : null,
          expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
          isActive: coupon.isActive,
        }
      : {
          code: '',
          description: '',
          type: 'PERCENTAGE',
          value: 10,
          minOrderAmount: 0,
          maxDiscount: null,
          usageLimit: null,
          perUserLimit: 1,
          startsAt: null,
          expiresAt: null,
          isActive: true,
        },
  });
  const e = form.formState.errors;
  const type = form.watch('type');
  const nullable = (v: string) => (v === '' ? null : Number(v));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{coupon ? `Edit ${coupon.code}` : 'New coupon'}</DialogTitle>
          <DialogDescription>
            Coupons are funded by the platform; sellers’ earnings are unaffected.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit(async (v) => {
            try {
              if (coupon) await api.admin.coupons.update(coupon.id, v as CouponOutput);
              else await api.admin.coupons.create(v as CouponOutput);
              toast.success('Coupon saved');
              onSaved();
              onClose();
            } catch (err) {
              applyApiError(form, err);
            }
          })}
        >
          <Field label="Code" htmlFor="cp-code" error={e.code?.message} required>
            <Input id="cp-code" className="font-mono uppercase" {...form.register('code')} />
          </Field>
          <Field label="Type" htmlFor="cp-type">
            <Select id="cp-type" {...form.register('type')}>
              <option value="PERCENTAGE">Percentage off</option>
              <option value="FLAT">Flat amount off</option>
            </Select>
          </Field>
          <Field
            label={type === 'PERCENTAGE' ? 'Discount %' : 'Discount ₹'}
            htmlFor="cp-val"
            error={e.value?.message}
            required
          >
            <Input
              id="cp-val"
              type="number"
              step="0.01"
              min={0}
              {...form.register('value', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Minimum order ₹" htmlFor="cp-min" error={e.minOrderAmount?.message}>
            <Input
              id="cp-min"
              type="number"
              min={0}
              {...form.register('minOrderAmount', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Max discount ₹" htmlFor="cp-max" hint="Caps percentage coupons">
            <Input
              id="cp-max"
              type="number"
              min={0}
              {...form.register('maxDiscount', { setValueAs: nullable })}
            />
          </Field>
          <Field label="Total usage limit" htmlFor="cp-lim" hint="Blank = unlimited">
            <Input
              id="cp-lim"
              type="number"
              min={1}
              {...form.register('usageLimit', { setValueAs: nullable })}
            />
          </Field>
          <Field label="Uses per customer" htmlFor="cp-pu">
            <Input
              id="cp-pu"
              type="number"
              min={1}
              {...form.register('perUserLimit', { valueAsNumber: true })}
            />
          </Field>
          <div />
          <Field label="Starts" htmlFor="cp-st">
            <Input
              id="cp-st"
              type="datetime-local"
              defaultValue={toLocalInput(coupon?.startsAt)}
              onChange={(ev) =>
                form.setValue('startsAt', ev.target.value ? new Date(ev.target.value) : null)
              }
            />
          </Field>
          <Field label="Expires" htmlFor="cp-ex" error={e.expiresAt?.message}>
            <Input
              id="cp-ex"
              type="datetime-local"
              defaultValue={toLocalInput(coupon?.expiresAt)}
              onChange={(ev) =>
                form.setValue('expiresAt', ev.target.value ? new Date(ev.target.value) : null)
              }
            />
          </Field>
          <Field label="Description" htmlFor="cp-d" className="sm:col-span-2">
            <Input id="cp-d" {...form.register('description')} />
          </Field>
          <div className="sm:col-span-2">
            <CheckRow
              id="cp-a"
              checked={!!form.watch('isActive')}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            >
              Active
            </CheckRow>
          </div>
          <Button
            type="submit"
            size="lg"
            className="sm:col-span-2"
            loading={form.formState.isSubmitting}
          >
            Save coupon
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CouponsAdmin() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<AdminCouponDto | 'new' | null>(null);
  const [del, setDel] = useState<AdminCouponDto | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['table', 'admin-coupons'] });
  };
  const columns: ColumnDef<AdminCouponDto>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row: { original: c } }) => (
        <div>
          <p className="font-mono font-extrabold tracking-wide">{c.code}</p>
          <p className="text-xs text-muted-foreground">{c.description}</p>
        </div>
      ),
    },
    {
      id: 'disc',
      header: 'Discount',
      cell: ({ row: { original: c } }) => (
        <span className="font-semibold">
          {c.type === 'PERCENTAGE' ? `${c.value}%` : formatINR(c.value)}
          {c.maxDiscount ? (
            <span className="text-xs font-normal text-muted-foreground">
              {' '}
              up to {formatINR(c.maxDiscount)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: 'minOrderAmount',
      header: 'Min order',
      cell: ({ row }) => formatINR(row.original.minOrderAmount),
    },
    {
      id: 'usage',
      header: 'Used',
      cell: ({ row: { original: c } }) => (
        <span className="tabular-nums">
          {c.usedCount}
          {c.usageLimit ? ` / ${c.usageLimit}` : ''}{' '}
          <span className="text-xs text-muted-foreground">({c.perUserLimit}/user)</span>
        </span>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.expiresAt ? formatDate(row.original.expiresAt) : 'Never'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge
          status={
            row.original.isActive &&
            (!row.original.expiresAt || new Date(row.original.expiresAt) > new Date())
              ? 'ACTIVE'
              : 'ARCHIVED'
          }
        />
      ),
    },
    {
      id: 'a',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: c } }) => (
        <div className="flex justify-end">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Edit ${c.code}`}
            onClick={() => setEdit(c)}
          >
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${c.code}`}
            onClick={() => setDel(c)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Coupons"
        description="Flat or percentage discounts with minimum order, caps, usage limits and expiry."
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus /> New coupon
          </Button>
        }
      />
      <ServerTable<AdminCouponDto>
        queryKey="admin-coupons"
        fetcher={(p) => api.admin.coupons.list(p)}
        columns={columns}
        searchPlaceholder="Search code…"
        filters={[
          {
            key: 'status',
            label: 'State',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
        ]}
        emptyTitle="No coupons"
      />
      {edit && (
        <CouponDialog
          coupon={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
      <ReasonDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.code}?`}
        confirmLabel="Delete"
        destructive
        requireReason={false}
        label=""
        onConfirm={async () => {
          await api.admin.coupons.remove(del!.id);
          toast.success('Coupon deleted');
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── serviceable pincodes ─────────────────────────
export function PincodesAdmin() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<ServiceablePincodeDto | 'new' | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['table', 'admin-pincodes'] });
  };
  const form = useZodForm(serviceablePincodeSchema, {
    defaultValues: {
      pincode: '',
      city: '',
      state: '',
      deliveryDays: 4,
      codAvailable: true,
      isActive: true,
    },
  });
  const openEdit = (p: ServiceablePincodeDto | 'new') => {
    setEdit(p);
    form.reset(
      p === 'new'
        ? { pincode: '', city: '', state: '', deliveryDays: 4, codAvailable: true, isActive: true }
        : p,
    );
  };
  const e = form.formState.errors;
  const columns: ColumnDef<ServiceablePincodeDto>[] = [
    {
      accessorKey: 'pincode',
      header: 'PIN',
      cell: ({ row }) => <span className="font-mono font-bold">{row.original.pincode}</span>,
    },
    { accessorKey: 'city', header: 'City' },
    { accessorKey: 'state', header: 'State' },
    {
      accessorKey: 'deliveryDays',
      header: 'Days',
      cell: ({ row }) => <span className="tabular-nums">{row.original.deliveryDays}</span>,
    },
    {
      accessorKey: 'codAvailable',
      header: 'COD',
      cell: ({ row }) => (row.original.codAvailable ? 'Yes' : 'No'),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'ARCHIVED'} />,
    },
    {
      id: 'a',
      header: '',
      meta: { className: 'text-right' },
      cell: ({ row: { original: p } }) => (
        <div className="flex justify-end">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Edit ${p.pincode}`}
            onClick={() => openEdit(p)}
          >
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${p.pincode}`}
            onClick={async () => {
              try {
                await api.admin.pincodes.remove(p.id);
                toast.success('PIN code removed');
                refresh();
              } catch (err) {
                toast.error(errMsg(err));
              }
            }}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="mb-3 mt-10 flex items-end justify-between">
        <div>
          <h2 className="font-display text-xl font-extrabold">Serviceable PIN codes</h2>
          <p className="text-sm text-muted-foreground">
            When any PIN is configured, only active PINs can check out. Leave empty to serve
            everywhere.
          </p>
        </div>
        <Button onClick={() => openEdit('new')}>
          <Plus /> Add PIN code
        </Button>
      </div>
      <ServerTable<ServiceablePincodeDto>
        queryKey="admin-pincodes"
        fetcher={(p) => api.admin.pincodes.list(p)}
        columns={columns}
        searchPlaceholder="Search PIN or city…"
        pageSize={10}
      />
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{edit === 'new' ? 'Add PIN code' : 'Edit PIN code'}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit(async (v) => {
              try {
                if (edit === 'new') await api.admin.pincodes.create(v);
                else await api.admin.pincodes.update((edit as ServiceablePincodeDto).id, v);
                toast.success('Saved');
                setEdit(null);
                refresh();
              } catch (err) {
                applyApiError(form, err);
              }
            })}
          >
            <Field label="PIN code" htmlFor="pc-pin" error={e.pincode?.message} required>
              <Input id="pc-pin" inputMode="numeric" maxLength={6} {...form.register('pincode')} />
            </Field>
            <Field label="City" htmlFor="pc-city" error={e.city?.message} required>
              <Input id="pc-city" {...form.register('city')} />
            </Field>
            <Field label="State" htmlFor="pc-state" error={e.state?.message} required>
              <Select id="pc-state" {...form.register('state')}>
                <option value="">Select</option>
                {INDIAN_STATE_NAMES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Delivery days" htmlFor="pc-days">
              <Input
                id="pc-days"
                type="number"
                min={1}
                max={30}
                {...form.register('deliveryDays', { valueAsNumber: true })}
              />
            </Field>
            <CheckRow
              id="pc-cod"
              checked={!!form.watch('codAvailable')}
              onCheckedChange={(v) => form.setValue('codAvailable', v)}
            >
              Cash on Delivery available
            </CheckRow>
            <CheckRow
              id="pc-act"
              checked={!!form.watch('isActive')}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            >
              Active
            </CheckRow>
            <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
