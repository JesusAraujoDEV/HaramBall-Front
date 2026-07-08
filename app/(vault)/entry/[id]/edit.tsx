import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import useVaultStore from '../../../../src/vault/vaultStore';
import { EntryService } from '../../../../src/services/EntryService';
import { EntryEditor } from '../../../../src/features/vault/EntryEditor';
import { ApiError } from '../../../../src/api/errors';
import { toUserMessage } from '../../../../src/utils/errorMessages';

export default function EditEntryScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const keys = useVaultStore((s) => s.keys);
  const removeEntry = useVaultStore((s) => s.removeEntry);

  const entryQuery = useQuery({
    queryKey: ['entries', 'detail', id],
    queryFn: () => EntryService.get(id, keys!),
    enabled: keys !== null && !!id,
  });

  if (entryQuery.error instanceof ApiError && entryQuery.error.status === 404) {
    removeEntry(id);
    router.replace('/');
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-950">
        <Text className="text-center text-zinc-600 dark:text-zinc-400">This entry no longer exists.</Text>
      </View>
    );
  }

  if (entryQuery.isLoading || !entryQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        {entryQuery.isError ? (
          <Text className="text-center text-red-600 dark:text-red-400">{toUserMessage(entryQuery.error)}</Text>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return <EntryEditor mode="edit" entryId={id} initialEntry={entryQuery.data} />;
}
