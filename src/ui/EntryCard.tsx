import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PlainEntry } from '../services/types';

interface Props {
  entry: PlainEntry;
  onPress: (entry: PlainEntry) => void;
}

/**
 * Vault list card: decrypted title, tag chips, and an expand affordance
 * (tap navigates to the detail screen for the body/copy actions). Shows a
 * distinct state for entries that failed to decrypt so one bad entry never
 * crashes the list (Requirement 7.3).
 */
export function EntryCard({ entry, onPress }: Props): React.ReactElement {
  if (entry.decryptError) {
    return (
      <View
        className="mx-4 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950"
        testID={`entry-card-${entry.id}`}
      >
        <Text className="text-red-600 dark:text-red-400">Could not decrypt this entry</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(entry)}
      className="mx-4 mb-2 flex-row items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
      testID={`entry-card-${entry.id}`}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50" numberOfLines={1}>
          {entry.title}
        </Text>
        {entry.tags.length > 0 ? (
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-800">
                <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Text className="ml-3 text-lg text-zinc-300 dark:text-zinc-600">›</Text>
    </Pressable>
  );
}

export default EntryCard;
