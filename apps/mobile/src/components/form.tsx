import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { TextInputProps } from 'react-native';
import { Field, PasswordField } from './ui';

interface Props<T extends FieldValues> extends Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'onBlur'
> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  hint?: string;
  password?: boolean;
  /** Server-side field error (shown when the client-side schema has none). */
  serverError?: string;
  containerClassName?: string;
}

/** react-hook-form binding for the shared Field component. */
export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  password,
  serverError,
  containerClassName,
  ...rest
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const common = {
          label,
          hint,
          containerClassName,
          value: field.value == null ? '' : String(field.value),
          onChangeText: field.onChange,
          onBlur: field.onBlur,
          error: fieldState.error?.message ?? serverError,
          ...rest,
        };
        return password ? <PasswordField {...common} /> : <Field {...common} />;
      }}
    />
  );
}
