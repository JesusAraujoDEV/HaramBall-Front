import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import useVaultStore from '../../vault/vaultStore';
import { EntryService } from '../../services/EntryService';
import { parseStructuredBody, serializeStructuredBody, type EntryField } from '../../utils/entryText';
import { TagInput } from '../../ui/TagInput';
import { ApiError } from '../../api/errors';
import { toUserMessage } from '../../utils/errorMessages';
import { generatePassword } from '../../utils/passwordGenerator';
import type { PlainEntry } from '../../services/types';

interface Props {
  mode: 'create' | 'edit';
  entryId?: string;
  initialEntry?: PlainEntry;
}

/** Fields a brand-new entry starts with, matching the user's common case. */
const DEFAULT_FIELDS: EntryField[] = [
  { label: 'correo', value: '' },
  { label: 'usuario', value: '' },
  { label: 'password', value: '' },
];

/** Builds the initial editable field list from an entry being edited. */
function initialFields(entry: PlainEntry | undefined): EntryField[] {
  if (!entry) return DEFAULT_FIELDS.map((f) => ({ ...f }));
  const { fields } = parseStructuredBody(entry.body);
  return fields.length > 0 ? fields : DEFAULT_FIELDS.map((f) => ({ ...f }));
}

/**
 * Shared create/edit form. An entry is a Title plus a list of labeled fields
 * (correo/usuario/password by default, any label allowed) and optional free
 * notes. Fields are serialized into the single encrypted body blob, so the
 * backend and offline layers are unchanged (Requirements 6.1-6.6, 8.1-8.4,
 * 9.1-9.4).
 */
export function EntryEditor({ mode, entryId, initialEntry }: Props): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const keys = useVaultStore((s) => s.keys);
  const upsertEntry = useVaultStore((s) => s.upsertEntry);

  const [title, setTitle] = useState(initialEntry?.title ?? '');
  const [fields, setFields] = useState<EntryField[]>(() => initialFields(initialEntry));
  const [notes, setNotes] = useState(() =>
    initialEntry ? parseStructuredBody(initialEntry.body).notes : '',
  );
  const [tags, setTags] = useState<string[]>(initialEntry?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function updateField(index: number, patch: Partial<EntryField>): void {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField(): void {
    setFields((prev) => [...prev, { label: '', value: '' }]);
  }

  function removeField(index: number): void {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current) return;

    if (title.trim().length === 0) {
      setError('Please enter a title.');
      return;
    }
    setError(null);

    const body = serializeStructuredBody(fields, notes);

    submittingRef.current = true;
    setSubmitting(true);
    try {
      let entry: PlainEntry;
      if (mode === 'create') {
        entry = await EntryService.create(title.trim(), body, tags, keys!);
      } else {
        entry = await EntryService.update(entryId!, title.trim(), body, tags, keys!);
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
    <ScrollView className="flex-1 bg-zinc-100 dark:bg-zinc-950" keyboardShouldPersistTaps="handled">
      <View className="gap-4 p-4 pt-14">
        <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {mode === 'create' ? 'New entry' : 'Edit entry'}
        </Text>

        <View className="gap-1.5">
          <Text className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Google Gmail 2"
            placeholderTextColor="#a1a1aa"
            className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            testID="entry-title"
          />
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Fields
          </Text>
          {fields.map((field, index) => (
            <View
              key={index}
              className="flex-row items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
              testID={`entry-field-${index}`}
            >
              <TextInput
                value={field.label}
                onChangeText={(label) => updateField(index, { label })}
                placeholder="label"
                placeholderTextColor="#a1a1aa"
                autoCapitalize="none"
                className="w-24 text-sm font-medium text-zinc-500 dark:text-zinc-400"
                testID={`entry-field-label-${index}`}
              />
              <Text className="text-zinc-300 dark:text-zinc-700">│</Text>
              <TextInput
                value={field.value}
                onChangeText={(value) => updateField(index, { value })}
                placeholder="value"
                placeholderTextColor="#a1a1aa"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-base text-zinc-900 dark:text-zinc-50"
                testID={`entry-field-value-${index}`}
              />
              {field.label.toLowerCase().includes('password') ||
              field.label.toLowerCase().includes('contraseña') ||
              field.label.toLowerCase().includes('clave') ? (
                <Pressable
                  onPress={() => updateField(index, { value: generatePassword('strong') })}
                  hitSlop={8}
                  className="rounded-lg bg-zinc-100 px-2 py-1 active:opacity-70 dark:bg-zinc-800"
                  testID={`entry-field-gen-${index}`}
                >
                  <Text className="text-xs">🎲</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => removeField(index)} testID={`entry-field-remove-${index}`} hitSlop={8}>
                <Text className="text-lg text-zinc-400 dark:text-zinc-500">×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={addField}
            className="items-center rounded-2xl border border-dashed border-zinc-300 py-2.5 active:opacity-70 dark:border-zinc-700"
            testID="entry-field-add"
          >
            <Text className="text-sm font-medium text-zinc-500 dark:text-zinc-400">+ Add field</Text>
          </Pressable>
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Notes (optional)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            placeholder="Anything else…"
            placeholderTextColor="#a1a1aa"
            className="min-h-[80px] rounded-2xl border border-zinc-300 bg-white p-3 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            testID="entry-notes"
          />
        </View>

        <TagInput tags={tags} onChange={setTags} />

        {error ? <Text className="text-red-600 dark:text-red-400">{error}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="items-center rounded-xl bg-zinc-900 py-3 active:opacity-80 disabled:opacity-60 dark:bg-zinc-50"
          testID="entry-save"
        >
          {submitting ? (
            <ActivityIndicator color="#a1a1aa" />
          ) : (
            <Text className="font-semibold text-white dark:text-zinc-900">Save</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default EntryEditor;
