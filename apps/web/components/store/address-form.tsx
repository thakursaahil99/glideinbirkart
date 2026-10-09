'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { addressSchema } from '@gk/validators';
import { INDIAN_STATE_NAMES } from '@gk/utils';
import type { AddressDto } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { applyApiError, useZodForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { CheckRow, Field, Input, Select } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';

/** Address dialog used at checkout and in the address book. PIN code auto-fills city and state. */
export function AddressDialog({
  open,
  onOpenChange,
  address,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  address?: AddressDto | null;
  onSaved?: (a: AddressDto) => void;
}) {
  const save = hooks.useSaveAddress();
  const form = useZodForm(addressSchema, {
    defaultValues: address
      ? {
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2 ?? '',
          landmark: address.landmark ?? '',
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          type: address.type,
          isDefault: address.isDefault,
        }
      : {
          fullName: '',
          phone: '',
          line1: '',
          line2: '',
          landmark: '',
          city: '',
          state: '',
          pincode: '',
          type: 'HOME',
          isDefault: false,
        },
  });
  const { register, handleSubmit, formState, watch, setValue } = form;
  const pincode = watch('pincode');

  // autofill city/state from the serviceability table
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(pincode ?? '')) return;
    let cancelled = false;
    api.delivery
      .check(pincode)
      .then((r) => {
        if (cancelled || !r.city || !r.state) return;
        if (!form.getValues('city')) setValue('city', r.city, { shouldValidate: true });
        if (!form.getValues('state')) setValue('state', r.state, { shouldValidate: true });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pincode, form, setValue]);

  const err = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{address ? 'Edit address' : 'Add a new address'}</DialogTitle>
          <DialogDescription>We’ll use this to deliver your orders.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit((v) =>
            save.mutate(
              { id: address?.id, body: v },
              {
                onSuccess: async () => {
                  toast.success(address ? 'Address updated' : 'Address added');
                  onOpenChange(false);
                  if (onSaved)
                    onSaved(
                      (await api.addresses.list()).find(
                        (a) => a.pincode === v.pincode && a.line1 === v.line1,
                      ) ?? (await api.addresses.list())[0]!,
                    );
                },
                onError: (e) => applyApiError(form, e),
              },
            ),
          )}
        >
          <Field label="Full name" htmlFor="a-name" error={err.fullName?.message} required>
            <Input id="a-name" autoComplete="name" {...register('fullName')} />
          </Field>
          <Field label="Mobile number" htmlFor="a-phone" error={err.phone?.message} required>
            <Input
              id="a-phone"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="10-digit number"
              {...register('phone')}
            />
          </Field>
          <Field label="PIN code" htmlFor="a-pin" error={err.pincode?.message} required>
            <Input
              id="a-pin"
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
              {...register('pincode')}
            />
          </Field>
          <Field label="City" htmlFor="a-city" error={err.city?.message} required>
            <Input id="a-city" autoComplete="address-level2" {...register('city')} />
          </Field>
          <Field label="State" htmlFor="a-state" error={err.state?.message} required>
            <Select id="a-state" autoComplete="address-level1" {...register('state')}>
              <option value="">Select state</option>
              {INDIAN_STATE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address type" htmlFor="a-type">
            <Select id="a-type" {...register('type')}>
              <option value="HOME">Home</option>
              <option value="WORK">Work</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field
            className="sm:col-span-2"
            label="House no., building, street"
            htmlFor="a-l1"
            error={err.line1?.message}
            required
          >
            <Input id="a-l1" autoComplete="address-line1" {...register('line1')} />
          </Field>
          <Field label="Area, colony (optional)" htmlFor="a-l2" error={err.line2?.message}>
            <Input id="a-l2" autoComplete="address-line2" {...register('line2')} />
          </Field>
          <Field label="Landmark (optional)" htmlFor="a-lm" error={err.landmark?.message}>
            <Input id="a-lm" {...register('landmark')} />
          </Field>
          <div className="sm:col-span-2">
            <CheckRow
              id="a-default"
              checked={!!watch('isDefault')}
              onCheckedChange={(v) => setValue('isDefault', v)}
            >
              Make this my default address
            </CheckRow>
          </div>
          <Button type="submit" size="lg" className="sm:col-span-2" loading={save.isPending}>
            {address ? 'Save changes' : 'Save address'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
