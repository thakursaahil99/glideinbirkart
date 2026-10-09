import { Pressable, Text, View } from 'react-native';
import type { AddressDto } from '@gk/types';
import { cn } from '@/lib/cn';
import { Badge, Icon } from './ui';
import { useColors } from '@/lib/theme';

export function AddressCard({
  address,
  selected,
  onPress,
  actions,
}: {
  address: AddressDto;
  selected?: boolean;
  onPress?: () => void;
  actions?: React.ReactNode;
}) {
  const c = useColors();
  const body = (
    <View
      className={cn(
        'gap-1 rounded-2xl border bg-card p-4',
        selected ? 'border-primary bg-secondary/40' : 'border-border',
      )}
    >
      <View className="flex-row items-center gap-2">
        {onPress ? (
          <Icon
            name={selected ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={selected ? c.primary : c.mutedForeground}
          />
        ) : null}
        <Text className="flex-1 text-base font-bold text-foreground">{address.fullName}</Text>
        <Badge tone="muted">{address.type}</Badge>
        {address.isDefault ? <Badge tone="primary">Default</Badge> : null}
      </View>
      <Text className="text-sm leading-5 text-foreground">
        {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')}
        {'\n'}
        {address.city}, {address.state} {address.pincode}
      </Text>
      <Text className="text-sm text-muted-foreground">Phone: {address.phone}</Text>
      {actions}
    </View>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}
