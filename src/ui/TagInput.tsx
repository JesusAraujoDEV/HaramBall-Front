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
            className="flex-row items-center rounded-full bg-blue-50 px-3 py-1"
            testID={`tag-chip-${tag}`}
          >
            <Text className="text-sm text-blue-700">{tag}</Text>
            <Text className="ml-1 text-blue-700">×</Text>
          </Pressable>
        ))}
      </View>
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addTag}
          placeholder="Add a tag"
          autoCapitalize="none"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
          testID="tag-input"
        />
        <Pressable onPress={addTag} className="items-center justify-center rounded-lg bg-gray-200 px-4" testID="tag-add">
          <Text className="text-gray-700">Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default TagInput;
