import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RETURN_REASONS } from '@gk/types';
import { hooks } from '@/lib/api';
import { errMsg } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { RequireAuth } from '@/components/gate';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Field, Icon, Screen, ScreenHeader } from '@/components/ui';

function Form({ orderItemId, max }: { orderItemId: string; max: number }) {
  const router = useRouter();
  const c = useColors();
  const request = hooks.useRequestReturn();
  const [reason, setReason] = useState<(typeof RETURN_REASONS)[number] | null>(null);
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const submit = () => {
    if (!reason) return;
    request.mutate(
      {
        orderItemId,
        quantity: qty,
        reason,
        description: description.trim() || undefined,
        images: photos,
      },
      {
        onSuccess: () =>
          Alert.alert(
            'Return requested',
            'The seller will review your request. We will notify you of the decision.',
            [{ text: 'OK', onPress: () => router.replace('/returns') }],
          ),
        onError: (e) => Alert.alert('Could not request return', errMsg(e)),
      },
    );
  };

  return (
    <Screen scroll edges={[]} contentClassName="gap-5 p-4 pb-10">
      <View className="gap-2">
        <Text className="text-base font-bold text-foreground">Why are you returning this?</Text>
        {RETURN_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === r }}
            className={cn(
              'flex-row items-center gap-3 rounded-xl border bg-card p-3.5',
              reason === r ? 'border-primary bg-secondary/40' : 'border-border',
            )}
          >
            <Icon
              name={reason === r ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={reason === r ? c.primary : c.mutedForeground}
            />
            <Text className="flex-1 text-sm text-foreground">{r}</Text>
          </Pressable>
        ))}
      </View>
      {max > 1 ? (
        <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3">
          <Text className="text-sm font-semibold text-foreground">Quantity to return</Text>
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => setQty((q) => Math.max(1, q - 1))}
              hitSlop={8}
              accessibilityLabel="Decrease"
            >
              <Icon name="remove-circle-outline" size={26} />
            </Pressable>
            <Text className="min-w-4 text-center text-base font-bold text-foreground">{qty}</Text>
            <Pressable
              onPress={() => setQty((q) => Math.min(max, q + 1))}
              hitSlop={8}
              accessibilityLabel="Increase"
            >
              <Icon name="add-circle-outline" size={26} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <Field
        label="Tell us more (optional)"
        placeholder="Describe the issue"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
        className="h-24 py-3"
        textAlignVertical="top"
      />
      <PhotoPicker value={photos} onChange={setPhotos} folder="returns" max={5} />
      <Text className="text-xs text-muted-foreground">
        Refunds go to your original payment method once the seller receives the item.
      </Text>
      <Button
        title="Submit return request"
        size="lg"
        loading={request.isPending}
        disabled={!reason}
        onPress={submit}
      />
    </Screen>
  );
}

export default function ReturnScreen() {
  const router = useRouter();
  const { orderItemId, name, max } = useLocalSearchParams<{
    orderItemId: string;
    name?: string;
    max?: string;
  }>();
  return (
    <Screen>
      <ScreenHeader title={name ? `Return: ${name}` : 'Return item'} onBack={() => router.back()} />
      <RequireAuth next={`/return/${orderItemId}`}>
        <Form orderItemId={orderItemId} max={Math.max(1, Number(max) || 1)} />
      </RequireAuth>
    </Screen>
  );
}
