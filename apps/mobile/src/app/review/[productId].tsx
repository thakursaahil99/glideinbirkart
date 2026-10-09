import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { hooks } from '@/lib/api';
import { errMsg } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { RequireAuth } from '@/components/gate';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Field, Icon, Screen, ScreenHeader } from '@/components/ui';

const LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

function Form({ productId, orderItemId }: { productId: string; orderItemId?: string }) {
  const router = useRouter();
  const c = useColors();
  const create = hooks.useCreateReview();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const submit = () =>
    create.mutate(
      {
        productId,
        orderItemId,
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        images: photos,
      },
      {
        onSuccess: () =>
          Alert.alert('Thanks for your review!', 'It helps other shoppers decide.', [
            { text: 'Done', onPress: () => router.back() },
          ]),
        onError: (e) => Alert.alert('Could not submit review', errMsg(e)),
      },
    );

  return (
    <Screen scroll edges={[]} contentClassName="gap-5 p-4">
      <View className="items-center gap-2">
        <View className="flex-row gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Pressable
              key={i}
              onPress={() => setRating(i)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`}
            >
              <Icon name={rating >= i ? 'star' : 'star-outline'} size={44} color={c.accent} />
            </Pressable>
          ))}
        </View>
        <Text className="text-sm font-semibold text-muted-foreground">
          {LABELS[rating] || 'Tap a star to rate'}
        </Text>
      </View>
      <Field
        label="Headline (optional)"
        placeholder="Sum it up in a few words"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <Field
        label="Your review (optional)"
        placeholder="What did you like or dislike?"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        className="h-28 py-3"
        containerClassName=""
        textAlignVertical="top"
      />
      <PhotoPicker value={photos} onChange={setPhotos} folder="reviews" max={3} />
      <Button
        title="Submit review"
        size="lg"
        loading={create.isPending}
        disabled={rating < 1}
        onPress={submit}
      />
    </Screen>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
  const { productId, orderItemId, name } = useLocalSearchParams<{
    productId: string;
    orderItemId?: string;
    name?: string;
  }>();
  return (
    <Screen>
      <ScreenHeader
        title={name ? `Review: ${name}` : 'Write a review'}
        onBack={() => router.back()}
      />
      <RequireAuth title="Log in to write a review" next={`/review/${productId}`}>
        <Form productId={productId} orderItemId={orderItemId} />
      </RequireAuth>
    </Screen>
  );
}
