import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import useVaultStore from '../../vault/vaultStore';
import { EntryService, parseEntryText, serializeEntryText } from '../../services/EntryService';
import { TagInput } from '../../ui/TagInput';
import { ApiError } from '../../api/errors';
import { toUserMessage } from '../../utils/errorMessages';
import type { PlainEntry } from '../../services/types';

interface Props {
  mode: 'create' | 'edit';
  entryId?: string;
  initialEntry?: PlainEntry;
}

/**
 * Shared create/edit form: free-form text editor where the first line is
 * the Title and the rest is the Body, plus tag add/remove. Blocks
 * submission on a blank title, maps 413/404 to user-facing messages, and
 * optimistically updates the vault cache on success (Requirements 6.1, 6.2,
 * 6.4-6.6, 8.1-8.4, 9.1-9.4).
 */
export function EntryEditor({ mode, entryId, initialEntry }: Props): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const keys = useVaultStore((s) => s.keys);
  const upsertEntry = useVaultStore((s) => s.upsertEntry);

  const [text, setText] = useState(
    initialEntry ? serializeEntryText(initialEntry.title, initialEntry.body) : '',
  );
  const [tags, setTags] = useState<string[]>(initialEntry?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current) return;

    const { title, body } = parseEntryText(text);
    if (title.trim().length === 0) {
      setError('Please enter a title (the first line of the entry).');
      return;
    }
    setError(null);

    submittingRef.current = true;
    setSubmitting(true);
    try {
      let entry: PlainEntry;
      if (mode === 'create') {
        entry = await EntryService.create(title, body, tags, keys!);
      } else {
        entry = await EntryService.update(entryId!, title, body, tags, keys!);
      }
      upsertEntry(entry);
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) {
        setError('This entry is too large to save.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('This entry no longer exists.');
      } else {
        setError(toUserMessage(err));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="gap-4 p-6">
        <Text className="text-lg font-semibold text-gray-900">
          {mode === 'create' ? 'New entry' : 'Edit entry'}
        </Text>
        <Text className="text-sm text-gray-500">
          The first line is the title; everything after is the body.
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          className="min-h-[160px] rounded-lg border border-gray-300 p-3"
          placeholder={'Bancamiga\nuser@example.com\nPASSWORD123'}
          testID="entry-text"
        />

        <TagInput tags={tags} onChange={setTags} />

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="items-center rounded-lg bg-blue-600 py-3 disabled:opacity-60"
          testID="entry-save"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-medium text-white">Save</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default EntryEditor;
