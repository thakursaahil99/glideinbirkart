'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { ArrowLeft, Plus, Save, Send, Trash2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { productInputSchema, type ProductInput } from '@gk/validators';
import type { CategoryAttributeDto, CategoryDto, SellerProductDto } from '@gk/types';
import { formatINR } from '@gk/utils';
import { api } from '@/lib/api';
import { applyApiError, useZodForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { CheckRow, Field, Input, Select, Textarea } from '@/components/ui/form';
import { ImageUploader } from '@/components/store/image-uploader';
import { PageHeader } from '@/components/dashboard/common';

interface Leaf {
  id: string;
  label: string;
}

/** Only leaf categories can hold products; label them with their breadcrumb. */
function flattenLeaves(nodes: CategoryDto[], trail: string[] = []): Leaf[] {
  return nodes.flatMap((n) => {
    const t = [...trail, n.name];
    return n.children?.length ? flattenLeaves(n.children, t) : [{ id: n.id, label: t.join(' › ') }];
  });
}

function cartesian(axes: Array<{ slug: string; values: string[] }>): Array<Record<string, string>> {
  return axes.reduce<Array<Record<string, string>>>(
    (acc, axis) => acc.flatMap((c) => axis.values.map((v) => ({ ...c, [axis.slug]: v }))),
    [{}],
  );
}

const sameAttrs = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);
const GST = [0, 0.25, 3, 5, 12, 18, 28];
const SKU_PREFIX = (s: string) =>
  (
    s
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase() || 'SKU'
  ).padEnd(3, 'X');

function toFormValues(p: SellerProductDto): ProductInput {
  const skuById = new Map(p.variants.map((v) => [v.id, v.sku]));
  return {
    name: p.name,
    categoryId: p.categoryId,
    brandId: p.brandId,
    description: p.description,
    highlights: p.highlights,
    specifications: p.specifications,
    attributes: p.attributes,
    tags: p.tags,
    gstRate: p.gstRate,
    hsnCode: p.hsnCode ?? '',
    isReturnable: p.isReturnable,
    returnWindowDays: p.returnWindowDays,
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
    images: p.images.map((i) => ({
      url: i.url,
      alt: i.alt ?? undefined,
      variantSku: i.variantId ? skuById.get(i.variantId) : undefined,
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      attributes: v.attributes,
      mrp: v.mrp,
      price: v.price,
      stock: v.stock,
      lowStockThreshold: v.lowStockThreshold,
      weightGrams: v.weightGrams ?? undefined,
      isActive: v.isActive,
    })),
    submit: false,
  };
}

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: tree } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => api.catalog.categories(),
  });
  const { data: brands } = useQuery({
    queryKey: ['brands-list'],
    queryFn: () => api.catalog.brands(),
  });
  const { data: existing, isLoading: loadingProduct } = useQuery({
    queryKey: ['seller-product', productId],
    queryFn: () => api.seller.products.get(productId as string),
    enabled: !!productId,
  });
  const leaves = useMemo(() => flattenLeaves(tree ?? []), [tree]);

  const form = useZodForm(productInputSchema, {
    defaultValues: {
      name: '',
      categoryId: '',
      brandId: null,
      description: '',
      highlights: [''],
      specifications: [],
      attributes: {},
      tags: [],
      gstRate: 18,
      hsnCode: '',
      isReturnable: true,
      returnWindowDays: 7,
      seoTitle: '',
      seoDescription: '',
      images: [],
      variants: [],
      submit: true,
    },
  });
  const { register, control, watch, setValue, handleSubmit, formState, reset } = form;
  const {
    fields: variantFields,
    append,
    remove,
    replace,
  } = useFieldArray({ control, name: 'variants' });
  const {
    fields: specFields,
    append: addSpec,
    remove: removeSpec,
  } = useFieldArray({ control, name: 'specifications' });
  const err = formState.errors;

  const categoryId = watch('categoryId');
  const { data: attrs } = useQuery({
    queryKey: ['cat-attrs', categoryId],
    queryFn: () => api.catalog.attributesForCategory(categoryId),
    enabled: !!categoryId,
  });
  const axes = useMemo(() => (attrs ?? []).filter((a) => a.isVariantAxis), [attrs]);
  const plainAttrs = useMemo(() => (attrs ?? []).filter((a) => !a.isVariantAxis), [attrs]);
  const [axisSel, setAxisSel] = useState<Record<string, string[]>>({});
  const [loaded, setLoaded] = useState(!productId);

  // edit mode: hydrate once
  useEffect(() => {
    if (existing && !loaded) {
      reset(toFormValues(existing));
      const sel: Record<string, string[]> = {};
      existing.variants.forEach((v) =>
        Object.entries(v.attributes).forEach(([k, val]) => {
          sel[k] = [...new Set([...(sel[k] ?? []), val])];
        }),
      );
      setAxisSel(sel);
      setLoaded(true);
    }
  }, [existing, loaded, reset]);

  // a category without variant axes sells a single default SKU
  useEffect(() => {
    if (!loaded || !attrs) return;
    if (axes.length === 0 && variantFields.length === 0)
      append({
        sku: '',
        name: 'Default',
        attributes: {},
        mrp: 0,
        price: 0,
        stock: 0,
        isActive: true,
      } as never);
  }, [attrs, axes.length, variantFields.length, append, loaded]);

  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const toggleAxisValue = (slug: string, value: string) =>
    setAxisSel((s) => ({
      ...s,
      [slug]: s[slug]?.includes(value)
        ? s[slug].filter((v) => v !== value)
        : [...(s[slug] ?? []), value],
    }));

  const generate = () => {
    const chosen = axes.map((a) => ({ slug: a.slug, values: axisSel[a.slug] ?? [] }));
    if (chosen.some((c) => c.values.length === 0))
      return toast.error('Pick at least one value for every option');
    const combos = cartesian(chosen);
    if (combos.length > 100) return toast.error('That would create more than 100 variants');
    const current = form.getValues('variants') ?? [];
    const base = current[0];
    const prefix = SKU_PREFIX(form.getValues('name') || 'item');
    replace(
      combos.map((attributes, i) => {
        const keep = current.find((v) => sameAttrs(v.attributes ?? {}, attributes));
        return (
          keep ??
          ({
            sku: `${prefix}-${String(Date.now()).slice(-4)}${i + 1}`,
            name: Object.values(attributes).join(' / '),
            attributes,
            mrp: base?.mrp ?? 0,
            price: base?.price ?? 0,
            stock: 0,
            isActive: true,
          } as never)
        );
      }),
    );
  };

  const submit = (publish: boolean) =>
    handleSubmit(
      async (values) => {
        const body = { ...values, submit: publish };
        try {
          const saved = productId
            ? await api.seller.products.update(productId, body)
            : await api.seller.products.create(body);
          toast.success(publish ? 'Submitted for review' : 'Draft saved');
          void qc.invalidateQueries({ queryKey: ['table', 'seller-products'] });
          void qc.invalidateQueries({ queryKey: ['seller-product', productId] });
          router.push(saved.status === 'ACTIVE' ? '/seller/products' : '/seller/products');
        } catch (e) {
          applyApiError(form, e, 'Could not save the product');
        }
      },
      () => toast.error('Please fix the highlighted fields'),
    )();

  const images = watch('images') ?? [];
  const highlights = watch('highlights') ?? [];
  const tags = watch('tags') ?? [];
  const gst = watch('gstRate');
  const returnable = watch('isReturnable');

  if (productId && (loadingProduct || !loaded)) return <Skeleton className="h-[40rem]" />;
  const locked = existing?.status === 'PENDING_REVIEW';

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()}>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/seller/products">
          <ArrowLeft /> Products
        </Link>
      </Button>
      <PageHeader
        title={productId ? 'Edit product' : 'Add a product'}
        description={
          locked
            ? 'This product is awaiting moderation and cannot be edited right now.'
            : 'New products and content edits are reviewed by our team before going live.'
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => submit(false)}
              loading={formState.isSubmitting}
              disabled={locked}
            >
              <Save /> Save draft
            </Button>
            <Button
              type="button"
              onClick={() => submit(true)}
              loading={formState.isSubmitting}
              disabled={locked}
              data-testid="submit-product"
            >
              <Send /> Submit for review
            </Button>
          </>
        }
      />
      {existing?.status === 'REJECTED' && existing.rejectionReason && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
        >
          <b>Rejected by moderation:</b> {existing.rejectionReason}
        </div>
      )}

      <fieldset disabled={locked} className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Basic information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                className="sm:col-span-2"
                label="Product name"
                htmlFor="name"
                error={err.name?.message}
                required
              >
                <Input
                  id="name"
                  maxLength={160}
                  placeholder="e.g. Cotton Crew Neck T-Shirt"
                  {...register('name')}
                />
              </Field>
              <Field
                label="Category"
                htmlFor="categoryId"
                error={err.categoryId?.message}
                required
                hint="Pick the most specific category"
              >
                <Select
                  id="categoryId"
                  {...register('categoryId', {
                    onChange: () => {
                      setValue('attributes', {});
                      replace([]);
                      setAxisSel({});
                    },
                  })}
                >
                  <option value="">Select a category</option>
                  {leaves.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Brand" htmlFor="brandId">
                <Select
                  id="brandId"
                  {...register('brandId', { setValueAs: (v: string) => v || null })}
                >
                  <option value="">No brand</option>
                  {(brands ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                className="sm:col-span-2"
                label="Description"
                htmlFor="description"
                error={err.description?.message}
                required
              >
                <Textarea id="description" rows={6} maxLength={8000} {...register('description')} />
              </Field>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-[13px] font-semibold">
                  Key highlights{' '}
                  <span className="font-normal text-muted-foreground">
                    (up to 10 bullet points)
                  </span>
                </p>
                {highlights.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      aria-label={`Highlight ${i + 1}`}
                      value={h}
                      onChange={(e) =>
                        setValue(
                          'highlights',
                          highlights.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                      placeholder="e.g. 100% combed cotton"
                      className="h-10"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove highlight"
                      onClick={() =>
                        setValue(
                          'highlights',
                          highlights.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                {highlights.length < 10 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setValue('highlights', [...highlights, ''])}
                  >
                    <Plus /> Add highlight
                  </Button>
                )}
              </div>
              <Field
                className="sm:col-span-2"
                label="Search tags"
                hint="Comma separated — helps customers find this product"
              >
                <Input
                  value={tags.join(', ')}
                  onChange={(e) =>
                    setValue(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 15),
                    )
                  }
                  placeholder="cotton, casual, summer"
                />
              </Field>
            </CardContent>
          </Card>

          {plainAttrs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Product attributes</CardTitle>
                <CardDescription>Required for this category.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {plainAttrs.map((a) => (
                  <AttrField
                    key={a.id}
                    attr={a}
                    value={watch('attributes')?.[a.slug] ?? ''}
                    error={err.attributes?.[a.slug]?.message as string | undefined}
                    onChange={(v) =>
                      setValue(
                        'attributes',
                        { ...(form.getValues('attributes') ?? {}), [a.slug]: v },
                        { shouldValidate: true },
                      )
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Variants, pricing & stock</CardTitle>
              <CardDescription>
                Every SKU has its own MRP, selling price (GST-inclusive) and stock.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!categoryId && (
                <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                  Choose a category first.
                </p>
              )}
              {axes.length > 0 && (
                <div className="space-y-4 rounded-2xl bg-secondary/40 p-4">
                  {axes.map((a) => (
                    <div key={a.id}>
                      <p className="mb-2 text-[13px] font-semibold">{a.name}</p>
                      <div className="flex flex-wrap gap-2">
                        {(a.values.length
                          ? a.values
                          : (axisSel[a.slug] ?? []).map((v) => ({ id: v, value: v, hex: null }))
                        ).map((v) => {
                          const on = axisSel[a.slug]?.includes(v.value);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleAxisValue(a.slug, v.value)}
                              className={cn(
                                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                                on
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'bg-card hover:border-primary',
                              )}
                            >
                              {v.hex && (
                                <span
                                  className="size-3.5 rounded-full ring-1 ring-black/20"
                                  style={{ background: v.hex }}
                                />
                              )}
                              {v.value}
                            </button>
                          );
                        })}
                        {a.values.length === 0 && (
                          <form
                            className="flex gap-1.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const t = freeText[a.slug]?.trim();
                              if (t) {
                                toggleAxisValue(a.slug, t);
                                setFreeText((s) => ({ ...s, [a.slug]: '' }));
                              }
                            }}
                          >
                            <Input
                              aria-label={`Add ${a.name} value`}
                              value={freeText[a.slug] ?? ''}
                              onChange={(e) =>
                                setFreeText((s) => ({ ...s, [a.slug]: e.target.value }))
                              }
                              placeholder="Add value"
                              className="h-9 w-32"
                            />
                          </form>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="accent" size="sm" onClick={generate}>
                    <Wand2 /> Generate variants
                  </Button>
                </div>
              )}

              {variantFields.length > 0 && (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Variant</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">MRP ₹</th>
                        <th className="px-3 py-2">Price ₹</th>
                        <th className="px-3 py-2">Stock</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {variantFields.map((f, i) => {
                        const ve = err.variants?.[i];
                        const attrsOfRow = watch(`variants.${i}.attributes`) ?? {};
                        return (
                          <tr key={f.id} className="border-t align-top">
                            <td className="px-3 py-2">
                              <div className="flex max-w-[11rem] flex-wrap gap-1">
                                {Object.values(attrsOfRow).length ? (
                                  Object.values(attrsOfRow).map((v) => (
                                    <Badge
                                      key={v}
                                      variant="secondary"
                                      className="normal-case tracking-normal"
                                    >
                                      {v}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground">Default</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                aria-label={`SKU ${i + 1}`}
                                className="h-9 w-36 font-mono text-xs uppercase"
                                aria-invalid={!!ve?.sku}
                                {...register(`variants.${i}.sku`)}
                              />
                              {ve?.sku && (
                                <p className="mt-1 text-xs text-destructive">{ve.sku.message}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                aria-label={`MRP ${i + 1}`}
                                type="number"
                                min={0}
                                step="0.01"
                                className="h-9 w-28"
                                aria-invalid={!!ve?.mrp}
                                {...register(`variants.${i}.mrp`, { valueAsNumber: true })}
                              />
                              {ve?.mrp && (
                                <p className="mt-1 text-xs text-destructive">{ve.mrp.message}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                aria-label={`Price ${i + 1}`}
                                type="number"
                                min={0}
                                step="0.01"
                                className="h-9 w-28"
                                aria-invalid={!!ve?.price}
                                {...register(`variants.${i}.price`, { valueAsNumber: true })}
                              />
                              {(ve?.price || ve?.root) && (
                                <p className="mt-1 max-w-[9rem] text-xs text-destructive">
                                  {ve?.price?.message ?? ve?.root?.message}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                aria-label={`Stock ${i + 1}`}
                                type="number"
                                min={0}
                                className="h-9 w-24"
                                aria-invalid={!!ve?.stock}
                                {...register(`variants.${i}.stock`, { valueAsNumber: true })}
                              />
                            </td>
                            <td className="px-2 py-2">
                              {(axes.length > 0 || variantFields.length > 1) && (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label="Remove variant"
                                  onClick={() => remove(i)}
                                >
                                  <Trash2 className="text-destructive" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {typeof err.variants?.message === 'string' && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {err.variants.message}
                </p>
              )}
              {variantFields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Customers see “from{' '}
                  {formatINR(
                    Math.min(
                      ...variantFields.map((_, i) => Number(watch(`variants.${i}.price`)) || 0),
                    ),
                  )}
                  ”.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>
                The first image is the main photo. JPG/PNG/WebP, up to 5 MB each.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUploader
                folder="products"
                max={10}
                value={images.map((i) => i.url)}
                onChange={(urls) =>
                  setValue(
                    'images',
                    urls.map((u) => images.find((i) => i.url === u) ?? { url: u }),
                    { shouldValidate: true },
                  )
                }
                label="Add photo"
              />
              {err.images && (
                <p role="alert" className="mt-2 text-xs font-medium text-destructive">
                  {typeof err.images.message === 'string'
                    ? err.images.message
                    : 'Check your images'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
              <CardDescription>Shown as a table on the product page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {specFields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <Input
                    aria-label={`Spec name ${i + 1}`}
                    placeholder="Name (e.g. Material)"
                    className="h-10"
                    {...register(`specifications.${i}.key`)}
                  />
                  <Input
                    aria-label={`Spec value ${i + 1}`}
                    placeholder="Value (e.g. Cotton)"
                    className="h-10"
                    {...register(`specifications.${i}.value`)}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove specification"
                    onClick={() => removeSpec(i)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addSpec({ key: '', value: '' })}
              >
                <Plus /> Add specification
              </Button>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Tax & returns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                label="GST slab"
                htmlFor="gstRate"
                error={err.gstRate?.message}
                required
                hint="Prices are inclusive of GST"
              >
                <Select
                  id="gstRate"
                  value={gst}
                  onChange={(e) =>
                    setValue('gstRate', Number(e.target.value), { shouldValidate: true })
                  }
                >
                  {GST.map((g) => (
                    <option key={g} value={g}>
                      {g}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="HSN code" htmlFor="hsn" hint="Printed on the GST invoice">
                <Input id="hsn" maxLength={10} inputMode="numeric" {...register('hsnCode')} />
              </Field>
              <CheckRow
                id="returnable"
                checked={returnable ?? true}
                onCheckedChange={(v) => setValue('isReturnable', v)}
              >
                Eligible for returns
              </CheckRow>
              {returnable && (
                <Field label="Return window (days)" htmlFor="rw">
                  <Input
                    id="rw"
                    type="number"
                    min={1}
                    max={30}
                    {...register('returnWindowDays', { valueAsNumber: true })}
                  />
                </Field>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Search appearance (SEO)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Page title" htmlFor="seoTitle" hint="Up to 70 characters">
                <Input id="seoTitle" maxLength={70} {...register('seoTitle')} />
              </Field>
              <Field label="Meta description" htmlFor="seoDesc" hint="Up to 160 characters">
                <Textarea id="seoDesc" rows={3} maxLength={160} {...register('seoDescription')} />
              </Field>
            </CardContent>
          </Card>
        </aside>
      </fieldset>
    </form>
  );
}

function AttrField({
  attr,
  value,
  error,
  onChange,
}: {
  attr: CategoryAttributeDto;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={attr.name} required={attr.isRequired} error={error} htmlFor={`attr-${attr.slug}`}>
      {attr.values.length > 0 ? (
        <Select id={`attr-${attr.slug}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select {attr.name.toLowerCase()}</option>
          {attr.values.map((v) => (
            <option key={v.id}>{v.value}</option>
          ))}
        </Select>
      ) : (
        <Input
          id={`attr-${attr.slug}`}
          value={value}
          type={attr.type === 'NUMBER' ? 'number' : 'text'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
