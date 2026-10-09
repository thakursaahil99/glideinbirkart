import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';

export type IconName = keyof typeof Ionicons.glyphMap;
export function Icon({
  name,
  size = 20,
  color,
  className,
}: {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
}) {
  const c = useColors();
  return <Ionicons name={name} size={size} color={color ?? c.foreground} className={className} />;
}

// ───────── buttons ─────────

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'deal' | 'destructive' | 'accent';
const VARIANT: Record<Variant, { box: string; text: string }> = {
  primary: { box: 'bg-primary', text: 'text-primary-foreground' },
  secondary: { box: 'bg-secondary', text: 'text-secondary-foreground' },
  outline: { box: 'border border-border bg-card', text: 'text-foreground' },
  ghost: { box: '', text: 'text-primary' },
  deal: { box: 'bg-deal', text: 'text-deal-foreground' },
  accent: { box: 'bg-accent', text: 'text-accent-foreground' },
  destructive: { box: 'bg-destructive', text: 'text-destructive-foreground' },
};

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: IconName;
  className?: string;
}
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const v = VARIANT[variant];
  const off = disabled || loading;
  const c = useColors();
  const iconColor =
    variant === 'primary' || variant === 'deal' || variant === 'destructive'
      ? '#fff'
      : variant === 'accent'
        ? '#1b1b2f'
        : variant === 'secondary' || variant === 'ghost'
          ? c.primary
          : c.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-xl active:opacity-80',
        size === 'sm' ? 'h-9 px-3' : size === 'lg' ? 'h-14 px-6' : 'h-12 px-5',
        v.box,
        off && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : icon ? (
        <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={iconColor} />
      ) : null}
      <Text className={cn('font-bold', size === 'sm' ? 'text-sm' : 'text-base', v.text)}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  badge,
  size = 22,
  className,
}: {
  name: IconName;
  onPress?: () => void;
  label: string;
  badge?: number;
  size?: number;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      className={cn('size-10 items-center justify-center rounded-full active:bg-muted', className)}
    >
      <Icon name={name} size={size} />
      {badge ? (
        <View className="absolute right-0 top-0 min-w-[18px] items-center rounded-full bg-deal px-1">
          <Text className="text-[10px] font-bold text-deal-foreground">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ───────── inputs ─────────

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
  right?: ReactNode;
}
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, containerClassName, right, className, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const c = useColors();
  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? <Text className="text-sm font-semibold text-foreground">{label}</Text> : null}
      <View
        className={cn(
          'h-12 flex-row items-center rounded-xl border bg-card px-3',
          error ? 'border-destructive' : focused ? 'border-primary' : 'border-input',
        )}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={c.mutedForeground}
          className={cn('flex-1 text-base text-foreground', className)}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text className="text-xs font-medium text-destructive">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
});

export function PasswordField(props: Omit<FieldProps, 'secureTextEntry' | 'right'>) {
  const [show, setShow] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <Pressable
          onPress={() => setShow((s) => !s)}
          hitSlop={10}
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
        >
          <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} />
        </Pressable>
      }
    />
  );
}

// ───────── layout ─────────

/** Page container with safe-area padding. `scroll` wraps children in a ScrollView with pull-to-refresh support. */
export function Screen({
  children,
  scroll,
  refreshing,
  onRefresh,
  edges = ['top'],
  className,
  contentClassName,
  ...rest
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Array<'top' | 'bottom'>;
  className?: string;
  contentClassName?: string;
} & Omit<ScrollViewProps, 'children' | 'className'>) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const style: StyleProp<ViewStyle> = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  };
  if (!scroll)
    return (
      <View style={style} className={cn('flex-1 bg-background', className)}>
        {children}
      </View>
    );
  return (
    <View style={style} className={cn('flex-1 bg-background', className)}>
      <ScrollView
        contentContainerClassName={contentClassName}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
              colors={[c.primary]}
            />
          ) : undefined
        }
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-end justify-between px-4', className)}>
      <Text className="text-lg font-extrabold text-foreground" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text className="text-sm font-semibold text-primary">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn('h-px bg-border', className)} />;
}

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'success' | 'warning' | 'destructive' | 'primary' | 'deal';
  className?: string;
}) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/20 text-foreground',
    destructive: 'bg-destructive/15 text-destructive',
    primary: 'bg-secondary text-secondary-foreground',
    deal: 'bg-deal text-deal-foreground',
  } as const;
  const [bg, fg] = tones[tone].split(' ') as [string, string];
  return (
    <View className={cn('self-start rounded-full px-2.5 py-1', bg, className)}>
      <Text className={cn('text-xs font-bold', fg)}>{children}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={cn(
        'h-9 flex-row items-center gap-1.5 rounded-full border px-3.5',
        selected ? 'border-primary bg-primary' : 'border-border bg-card',
      )}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? '#fff' : c.foreground} /> : null}
      <Text
        className={cn(
          'text-sm font-semibold',
          selected ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const c = useColors();
  return (
    <View className="flex-row" accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={c.accent}
        />
      ))}
    </View>
  );
}

export function RatingPill({ value, count }: { value: number; count?: number }) {
  if (!count) return null;
  return (
    <View className="flex-row items-center gap-1 self-start rounded-md bg-success px-1.5 py-0.5">
      <Text className="text-xs font-bold text-success-foreground">{value.toFixed(1)}</Text>
      <Ionicons name="star" size={10} color="#fff" />
      <Text className="text-[10px] text-success-foreground/80">({count})</Text>
    </View>
  );
}

// ───────── states ─────────

export function Spinner({ className }: { className?: string }) {
  const c = useColors();
  return (
    <View className={cn('items-center justify-center py-10', className)}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function EmptyState({
  icon = 'bag-outline',
  title,
  message,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const c = useColors();
  return (
    <View className="items-center gap-3 px-8 py-16">
      <View className="size-20 items-center justify-center rounded-full bg-secondary">
        <Ionicons name={icon} size={34} color={c.primary} />
      </View>
      <Text className="text-center text-lg font-extrabold text-foreground">{title}</Text>
      {message ? (
        <Text className="text-center text-sm leading-5 text-muted-foreground">{message}</Text>
      ) : null}
      {action ? <Button title={action} onPress={onAction} className="mt-2" /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Could not load this"
      message={message ?? 'Check your connection and try again.'}
      action={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style} className={cn('rounded-lg bg-muted', className)} />;
}

/** Header row used by every stack screen (the native header is hidden in favour of this one). */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View className="h-14 flex-row items-center gap-1 border-b border-border bg-background px-2">
      {onBack ? (
        <IconButton name="chevron-back" label="Go back" onPress={onBack} />
      ) : (
        <View className="w-2" />
      )}
      <Text
        className="flex-1 text-lg font-extrabold text-foreground"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {right}
    </View>
  );
}

export function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: ReactNode;
  bold?: boolean;
  tone?: 'success' | 'destructive';
}) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className={cn('text-sm text-muted-foreground', bold && 'font-bold text-foreground')}>
        {label}
      </Text>
      <Text
        className={cn(
          'text-sm text-foreground',
          bold && 'text-base font-extrabold',
          tone === 'success' && 'font-semibold text-success',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </Text>
    </View>
  );
}
