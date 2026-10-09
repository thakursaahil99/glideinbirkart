import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { errMsg, imageUrl } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Icon } from './ui';

/** Pick photos from the library, upload them to the API and keep the resulting URLs in `value`. */
export function PhotoPicker({
  value,
  onChange,
  folder,
  max = 3,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  folder: 'reviews' | 'returns';
  max?: number;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Permission needed', 'Allow photo access in Settings to attach pictures.');
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: max - value.length,
      quality: 0.7,
    });
    if (picked.canceled) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const [i, asset] of picked.assets.entries()) {
        const type = asset.mimeType ?? 'image/jpeg';
        const ext = type.split('/')[1] ?? 'jpg';
        const res = await api.uploads.upload(
          { uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}-${i}.${ext}`, type },
          folder,
        );
        urls.push(res.url);
      }
      onChange([...value, ...urls].slice(0, max));
    } catch (e) {
      Alert.alert('Upload failed', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-3">
        {value.map((url) => (
          <View key={url} className="size-20 overflow-hidden rounded-xl bg-muted">
            <Image
              source={{ uri: imageUrl(url) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
            <Pressable
              onPress={() => onChange(value.filter((u) => u !== url))}
              accessibilityLabel="Remove photo"
              hitSlop={6}
              className="absolute right-1 top-1 size-6 items-center justify-center rounded-full bg-black/60"
            >
              <Icon name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {value.length < max ? (
          <Pressable
            onPress={add}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            className="size-20 items-center justify-center rounded-xl border border-dashed border-border bg-card active:opacity-70"
          >
            <Icon
              name={busy ? 'hourglass-outline' : 'camera-outline'}
              size={24}
              color={c.primary}
            />
            <Text className="mt-0.5 text-[11px] font-semibold text-primary">
              {busy ? 'Uploading' : 'Add photo'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="text-xs text-muted-foreground">
        Up to {max} photos. {value.length}/{max} added.
      </Text>
    </View>
  );
}
