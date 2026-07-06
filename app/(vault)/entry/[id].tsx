import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useVaultStore from '../../../src/vault/vaultStore';
import { EntryService } from '../../../src/services/EntryService';
import { detectFields } from '../../../src/utils/entryText';
import { FieldCopyRow } from '../../../src/ui/FieldCopyRow';
import clipboardAdapter from '../../../src/platform/clipboard';
import { getEnv } from '../../../src/config/env';
import { ApiError } from '../../../src/api/errors';
import { toUserMessage } from '../../../src/utils/errorMessages';

/**
 * Entry detail: decrypts and displays title/body/tags/timestamps, offers a
 * full-body copy plus per-line detected-field copy, and handles 404 by
 * removing the entry from the cache and informing the user (Requirements
 * 7.2, 7.4, 7.5, 12.1-12.5).
 */
export default function EntryDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const keys = useVaultStore((s) => s.keys);
  const removeEntry = useVaultStore((s) => s.removeEntry);
  const [copiedBody, setCopiedBody] = useState(false);

  const entryQuery = useQuery({
    queryKey: ['entries', 'detail', id],
    queryFn: () => EntryService.get(id, keys!),
    enabled: keys !== null && !!id,
  });

  if (entryQuery.error instanceof ApiError && entryQuery.error.status === 404) {
    removeEntry(id);
    Alert.alert('Entry not found', 'This entry no longer exists.');
    router.replace('/');
  }

  async function handleCopyBody(body: string): Promise<void> {
    await clipboardAdapter.copy(body);
    clipboardAdapter.scheduleClear(body, getEnv().clipboardClearMs);
    setCopiedBody(true);
    setTimeout(() => setCopiedBody(false), 1500);
  }

  function handleDelete(): void {
    Alert.alert('Delete entry', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await EntryService.remove(id);
            removeEntry(id);
            await queryClient.invalidateQueries({ queryKey: ['entries', 'list'] });
            router.replace('/');
          } catch (err) {
            Alert.alert('Could not delete entry', toUserMessage(err));
          }
        },
      },
    ]);
  }

  if (entryQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (entryQuery.isError || !entryQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600">{toUserMessage(entryQuery.error)}</Text>
      </View>
    );
  }

  const entry = entryQuery.data;
  const fields = detectFields(entry.body);

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="p-6">
        <Text className="text-2xl font-bold text-gray-900">{entry.title}</Text>

        {entry.tags.length > 0 ? (
          <View className="mt-2 flex-row flex-wrap gap-2">
            {entry.tags.map((tag) => (
              <View key={tag} className="rounded-full bg-blue-50 px-3 py-1">
                <Text className="text-sm text-blue-700">{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="mt-4 text-xs text-gray-400">
          Created {new Date(entry.createdAt).toLocaleString()} · Updated{' '}
          {new Date(entry.updatedAt).toLocaleString()}
        </Text>

        <View className="mt-6 rounded-lg border border-gray-200">
          <Text className="whitespace-pre-wrap p-4 text-gray-900">{entry.body}</Text>
          <Pressable
            onPress={() => handleCopyBody(entry.body)}
            className="border-t border-gray-100 px-4 py-3"
            testID="copy-body"
          >
            <Text className="text-center text-blue-600">{copiedBody ? 'Copied!' : 'Copy full body'}</Text>
          </Pressable>
        </View>

        {fields.length > 0 ? (
          <View className="mt-6 rounded-lg border border-gray-200">
            {fields.map((field, index) => (
              <FieldCopyRow key={`${field.label}-${index}`} label={field.label} value={field.value} />
            ))}
          </View>
        ) : null}

        <View className="mt-6 flex-row gap-3">
          <Pressable
            onPress={() => router.push(`/entry/${id}/edit`)}
            className="flex-1 items-center rounded-lg bg-blue-600 py-3"
            testID="edit-entry"
          >
            <Text className="font-medium text-white">Edit</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            className="flex-1 items-center rounded-lg bg-red-600 py-3"
            testID="delete-entry"
          >
            <Text className="font-medium text-white">Delete</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
