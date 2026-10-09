import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Markdown } from '@/components/markdown';
import { ErrorState, Screen, ScreenHeader, Spinner } from '@/components/ui';
import { Text, View } from 'react-native';

/** Pages the admin edits under CMS pages (About, Terms, Privacy, Returns policy…) show here as well as on the website. */
export default function CmsPageScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const q = useQuery({
    queryKey: ['cms', slug],
    queryFn: () => api.cms.page(slug),
    staleTime: 60_000,
  });
  return (
    <Screen>
      <ScreenHeader title={q.data?.title ?? 'Information'} onBack={() => router.back()} />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !q.data ? (
        <ErrorState message="This page is not available." onRetry={() => void q.refetch()} />
      ) : (
        <Screen scroll edges={[]} contentClassName="gap-4 p-4 pb-10">
          <Markdown source={q.data.content} />
          <View>
            <Text className="text-xs text-muted-foreground">
              Last updated {formatDate(q.data.updatedAt)}
            </Text>
          </View>
        </Screen>
      )}
    </Screen>
  );
}
