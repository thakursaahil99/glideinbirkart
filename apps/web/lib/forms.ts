'use client';

import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
  type Path,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { ApiError } from '@gk/api-client';
import { toast } from 'sonner';

/** react-hook-form + shared Zod schema from @gk/validators (input and output types kept distinct). */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver' | 'defaultValues'> & {
    defaultValues?: DefaultValues<z.input<S>>;
  },
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({
    // zodResolver's generics are stricter than RHF's for transforming schemas; the cast is safe because the types come from the same schema.
    resolver: zodResolver(schema as never) as never,
    mode: 'onTouched',
    ...options,
  });
}

/** Push API field errors into the form; fall back to a toast for non-field errors. */
export function applyApiError<T extends FieldValues>(
  form: UseFormReturn<T, unknown, never> | UseFormReturn<T, unknown, T>,
  error: unknown,
  fallback = 'Something went wrong',
) {
  if (error instanceof ApiError) {
    const fields = error.fieldErrors;
    let applied = false;
    for (const [path, message] of Object.entries(fields)) {
      form.setError(path as Path<T>, { type: 'server', message });
      applied = true;
    }
    if (!applied) toast.error(error.message);
    return;
  }
  toast.error(fallback);
}

export const errMsg = (error: unknown, fallback = 'Something went wrong') =>
  error instanceof ApiError ? error.message : fallback;
