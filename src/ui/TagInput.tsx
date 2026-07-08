import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Add/remove tags on an Entry before submission (Requirement 6.6).
 */
export function TagInput({ tags, onChange }: Props): React.ReactElement {
  const [draft, setDraft] = useState('');

  function addTag(): void {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (!tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setDraft('');
  }

  function removeTag(tag: string): void {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {tags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => removeTag(tag)}
            className="flex-row items-center rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800"
            testID={`tag-chip-${tag}`}
          >
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{tag}</Text>
            <Text className="ml-1.5 text-zinc-400 dark:text-zinc-500">×</Text>
          </Pressable>
        ))}
      </View>
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addTag}
          placeholder="Add a tag"
          placeholderTextColor="#a1a1aa"
          autoCapitalize="none"
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          testID="tag-input"
        />
        <Pressable
          onPress={addTag}
          className="items-center justify-center rounded-xl bg-zinc-100 px-4 active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700"
          testID="tag-add"
        >
          <Text className="font-medium text-zinc-700 dark:text-zinc-300">Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default TagInput;
