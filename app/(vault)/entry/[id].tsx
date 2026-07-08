import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useVaultStore from '../../../src/vault/vaultStore';
import { EntryService } from '../../../src/services/EntryService';
import { detectFields, type DetectedField } from '../../../src/utils/entryText';
import { FieldCopyRow } from '../../../src/ui/FieldCopyRow';
import { PasswordHistory } from '../../../src/features/vault/PasswordHistory';
import clipboardAdapter from '../../../src/platform/clipboard';
import { getEnv } from '../../../src/config/env';
import { ApiError } from '../../../src/api/errors';
import { toUserMessage } from '../../../src/utils/errorMessages';

/**
 * One-tap copy button for a primary credential field (user/password),
 * rendered prominently at the top of the credential card.
 */
function QuickCopyButton({ label, value, testID }: { label: string; value: string; testID: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await clipboardAdapter.copy(value);
    clipboardAdapter.scheduleClear(value, getEnv().clipboardClearMs);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Pressable
      onPress={handleCopy}
      className="flex-1 items-center rounded-xl bg-zinc-900 py-3 active:opacity-80 dark:bg-zinc-50"
      testID={testID}
    >
      <Text className="text-sm font-semibold text-white dark:text-zinc-900">{copied ? 'Copied!' : label}</Text>
    </Pressable>
  );
}

/**
 * Entry detail: decrypts and displays title/body/tags/timestamps, offers
 * prominent Copy-user/Copy-password quick actions, per-line detected-field
 * copy, a collapsible previous-versions history, and handles 404 by removing
 * the entry from the cache and informing the user (Requirements 7.2, 7.4,
 * 7.5, 12.1-12.5).
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
      <View className="flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <ActivityIndicator color="#a1a1aa" />
      </View>
    );
  }

  if (entryQuery.isError || !entryQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-950">
        <Text className="text-center text-red-600 dark:text-red-400">{toUserMessage(entryQuery.error)}</Text>
      </View>
    );
  }

  const entry = entryQuery.data;
  const fields = detectFields(entry.body);
  const userField: DetectedField | undefined = fields.find((f) => f.label === 'user' || f.label === 'email');
  const passwordField: DetectedField | undefined = fields.find((f) => f.label === 'password');

  return (
    <ScrollView className="flex-1 bg-zinc-100 dark:bg-zinc-950" contentContainerStyle={{ paddingBottom: 48 }}>
      <View className="p-4 pt-14">
        <Pressable onPress={() => router.back()} className="mb-3 self-start" testID="entry-back">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">‹ Back</Text>
        </Pressable>

        <Text className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{entry.title}</Text>

        {entry.tags.length > 0 ? (
          <View className="mt-2.5 flex-row flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-200 px-2.5 py-0.5 dark:bg-zinc-800">
                <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          Created {new Date(entry.createdAt).toLocaleString()} · Updated{' '}
          {new Date(entry.updatedAt).toLocaleString()}
        </Text>

        {userField || passwordField ? (
          <View className="mt-5 flex-row gap-3">
            {userField ? <QuickCopyButton label="Copy user" value={userField.value} testID="copy-user" /> : null}
            {passwordField ? (
              <QuickCopyButton label="Copy password" value={passwordField.value} testID="copy-password" />
            ) : null}
          </View>
        ) : null}

        {fields.length > 0 ? (
          <View className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {fields.map((field, index) => (
              <FieldCopyRow key={`${field.label}-${index}`} label={field.label} value={field.value} />
            ))}
          </View>
        ) : null}

        {entry.body.length > 0 ? (
          <View className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="whitespace-pre-wrap p-4 text-zinc-900 dark:text-zinc-50">{entry.body}</Text>
            <Pressable
              onPress={() => handleCopyBody(entry.body)}
              className="border-t border-zinc-100 px-4 py-3 active:bg-zinc-50 dark:border-zinc-800 dark:active:bg-zinc-800"
              testID="copy-body"
            >
              <Text className="text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {copiedBody ? 'Copied!' : 'Copy full body'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <PasswordHistory entryId={id} />

        <View className="mt-6 flex-row gap-3">
          <Pressable
            onPress={() => router.push(`/entry/${id}/edit`)}
            className="flex-1 items-center rounded-xl bg-zinc-900 py-3 active:opacity-80 dark:bg-zinc-50"
            testID="edit-entry"
          >
            <Text className="font-semibold text-white dark:text-zinc-900">Edit</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            className="flex-1 items-center rounded-xl border border-red-300 py-3 active:bg-red-50 dark:border-red-900 dark:active:bg-red-950"
            testID="delete-entry"
          >
            <Text className="font-semibold text-red-600 dark:text-red-400">Delete</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
