import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addressSchema, type AddressInput, type AddressOutput } from '@gk/validators';
import { INDIAN_STATE_NAMES } from '@gk/utils';
import { hooks } from '@/lib/api';
import { errMsg, fieldErrors } from '@/lib/format';
import { RequireAuth } from '@/components/gate';
import { FormField } from '@/components/form';
import { Button, Chip, Icon, IconButton, Screen, ScreenHeader, Spinner } from '@/components/ui';

const EMPTY: AddressInput = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '' as never,
  pincode: '',
  type: 'HOME',
  isDefault: false,
};

function StatePicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-foreground">State</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        className={`h-12 flex-row items-center justify-between rounded-xl border bg-card px-3 ${error ? 'border-destructive' : 'border-input'}`}
      >
        <Text className={value ? 'text-base text-foreground' : 'text-base text-muted-foreground'}>
          {value || 'Select state'}
        </Text>
        <Icon name="chevron-down" size={18} />
      </Pressable>
      {error ? <Text className="text-xs font-medium text-destructive">{error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Screen>
          <View className="h-14 flex-row items-center justify-between border-b border-border px-4">
            <Text className="text-lg font-extrabold text-foreground">Select state</Text>
            <IconButton name="close" label="Close" onPress={() => setOpen(false)} />
          </View>
          <FlatList
            data={INDIAN_STATE_NAMES}
            keyExtractor={(s) => s}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
                className="flex-row items-center justify-between border-b border-border px-4 py-3.5"
              >
                <Text className={item === value ? 'font-bold text-primary' : 'text-foreground'}>
                  {item}
                </Text>
                {item === value ? <Icon name="checkmark" size={18} /> : null}
              </Pressable>
            )}
          />
        </Screen>
      </Modal>
    </View>
  );
}

function AddressForm({ id }: { id?: string }) {
  const router = useRouter();
  const addresses = hooks.useAddresses();
  const save = hooks.useSaveAddress();
  const [server, setServer] = useState<Record<string, string>>({});
  const existing = id ? addresses.data?.find((a) => a.id === id) : undefined;
  const { control, handleSubmit, reset } = useForm<AddressInput, unknown, AddressOutput>({
    resolver: zodResolver(addressSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (existing)
      reset({
        ...existing,
        line2: existing.line2 ?? '',
        landmark: existing.landmark ?? '',
      } as AddressInput);
  }, [existing, reset]);

  if (id && addresses.isLoading) return <Spinner />;

  const submit = handleSubmit((body) => {
    setServer({});
    save.mutate(
      { id, body },
      {
        onSuccess: () => router.back(),
        onError: (e) => {
          setServer(fieldErrors(e));
          Alert.alert('Could not save address', errMsg(e));
        },
      },
    );
  });

  return (
    <Screen scroll edges={[]} contentClassName="gap-4 p-4 pb-10">
      <FormField
        control={control}
        name="fullName"
        label="Full name"
        placeholder="Recipient name"
        autoComplete="name"
        serverError={server.fullName}
      />
      <FormField
        control={control}
        name="phone"
        label="Mobile number"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        maxLength={10}
        serverError={server.phone}
      />
      <FormField
        control={control}
        name="pincode"
        label="PIN code"
        placeholder="6-digit PIN code"
        keyboardType="number-pad"
        maxLength={6}
        serverError={server.pincode}
      />
      <FormField
        control={control}
        name="line1"
        label="Flat, house no., building"
        placeholder="House / flat / street"
        serverError={server.line1}
      />
      <FormField
        control={control}
        name="line2"
        label="Area, street (optional)"
        placeholder="Area, colony"
        serverError={server.line2}
      />
      <FormField
        control={control}
        name="landmark"
        label="Landmark (optional)"
        placeholder="Near..."
        serverError={server.landmark}
      />
      <FormField
        control={control}
        name="city"
        label="City"
        placeholder="Town / city"
        serverError={server.city}
      />
      <Controller
        control={control}
        name="state"
        render={({ field, fieldState }) => (
          <StatePicker
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message ?? server.state}
          />
        )}
      />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">Address type</Text>
            <View className="flex-row gap-2">
              {(['HOME', 'WORK', 'OTHER'] as const).map((t) => (
                <Chip
                  key={t}
                  label={t[0] + t.slice(1).toLowerCase()}
                  selected={field.value === t}
                  onPress={() => field.onChange(t)}
                />
              ))}
            </View>
          </View>
        )}
      />
      <Controller
        control={control}
        name="isDefault"
        render={({ field }) => (
          <Chip
            label="Make this my default address"
            icon={field.value ? 'checkbox' : 'square-outline'}
            selected={!!field.value}
            onPress={() => field.onChange(!field.value)}
          />
        )}
      />
      <Button
        title={id ? 'Save changes' : 'Save address'}
        size="lg"
        loading={save.isPending}
        onPress={submit}
      />
    </Screen>
  );
}

export default function AddressEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Screen>
      <ScreenHeader title={id ? 'Edit address' : 'New address'} onBack={() => router.back()} />
      <RequireAuth next="/addresses">
        <AddressForm id={id} />
      </RequireAuth>
    </Screen>
  );
}
