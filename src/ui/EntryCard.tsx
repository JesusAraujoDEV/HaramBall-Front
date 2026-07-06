import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PlainEntry } from '../services/types';

interface Props {
  entry: PlainEntry;
  onPress: (entry: PlainEntry) => void;
}

/**
 * Chat-style list row: decrypted title, tag chips, and an expand affordance
 * (tap navigates to the detail screen for the body/copy actions). Shows a
 * distinct state for entries that failed to decrypt so one bad entry never
 * crashes the list (Requirement 7.3).
 */
export function EntryCard({ entry, onPress }: Props): React.ReactElement {
  if (entry.decryptError) {
    return (
      <View className="border-b border-gray-100 px-4 py-3" testID={`entry-card-${entry.id}`}>
        <Text className="text-red-600">Could not decrypt this entry</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(entry)}
      className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
      testID={`entry-card-${entry.id}`}
    >
      <View className="flex-1">
        <Text className="text-base font-medium text-gray-900" numberOfLines={1}>
          {entry.title}
        </Text>
        {entry.tags.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <View key={tag} className="rounded-full bg-blue-50 px-2 py-0.5">
                <Text className="text-xs text-blue-700">{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Text className="ml-2 text-gray-400">{'>'}</Text>
    </Pressable>
  );
}

export default EntryCard;
