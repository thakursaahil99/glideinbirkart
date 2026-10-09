import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { hooks } from '@/lib/api';
import { errMsg } from '@/lib/format';
import { AddressCard } from '@/components/address';
import { RequireAuth } from '@/components/gate';
import { Button, EmptyState, ErrorState, Screen, ScreenHeader, Spinner } from '@/components/ui';

function AddressList() {
  const router = useRouter();
  const q = hooks.useAddresses();
  const del = hooks.useDeleteAddress();
  const setDefault = hooks.useSetDefaultAddress();

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;

  const confirmDelete = (id: string) =>
    Alert.alert('Delete address?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          del.mutate(id, { onError: (e) => Alert.alert('Could not delete', errMsg(e)) }),
      },
    ]);

  return (
    <>
      {!q.data?.length ? (
        <EmptyState
          icon="location-outline"
          title="No saved addresses"
          message="Add an address to check out faster."
        />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(a) => a.id}
          contentContainerClassName="gap-3 p-4"
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          renderItem={({ item }) => (
            <AddressCard
              address={item}
              actions={
                <View className="mt-2 flex-row gap-5">
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      router.push({ pathname: '/addresses/edit', params: { id: item.id } })
                    }
                  >
                    <Text className="text-sm font-semibold text-primary">Edit</Text>
                  </Pressable>
                  {!item.isDefault ? (
                    <Pressable hitSlop={8} onPress={() => setDefault.mutate(item.id)}>
                      <Text className="text-sm font-semibold text-primary">Make default</Text>
                    </Pressable>
                  ) : null}
                  <Pressable hitSlop={8} onPress={() => confirmDelete(item.id)}>
                    <Text className="text-sm font-semibold text-destructive">Delete</Text>
                  </Pressable>
                </View>
              }
            />
          )}
        />
      )}
      <View className="border-t border-border bg-card p-4">
        <Button
          title="Add new address"
          icon="add"
          size="lg"
          onPress={() => router.push('/addresses/edit')}
        />
      </View>
    </>
  );
}

export default function AddressesScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Saved addresses" onBack={() => router.back()} />
      <RequireAuth next="/addresses">
        <AddressList />
      </RequireAuth>
    </Screen>
  );
}
