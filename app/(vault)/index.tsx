import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { VaultList } from '../../src/features/vault/VaultList';
import { EntryDetail } from '../../src/features/vault/EntryDetail';
import type { PlainEntry } from '../../src/services/types';

/** Breakpoint above which the split (list + detail) dashboard is used. */
const SPLIT_MIN_WIDTH = 1024;

/**
 * Vault home. On phones it renders the full-width list with stacked
 * navigation; on wide screens (desktop web) it becomes a split dashboard —
 * search/list on the left, the expandable credential viewer on the right —
 * sharing the exact same components and business logic.
 */
export default function VaultHomeScreen(): React.ReactElement {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (width < SPLIT_MIN_WIDTH) {
    return <VaultList />;
  }

  return (
    <View className="flex-1 flex-row bg-zinc-100 dark:bg-zinc-950">
      <View className="w-[400px] border-r border-zinc-200 dark:border-zinc-800">
        <VaultList onSelectEntry={(entry: PlainEntry) => setSelectedId(entry.id)} />
      </View>
      <View className="flex-1">
        {selectedId ? (
          <EntryDetail
            key={selectedId}
            entryId={selectedId}
            onEdit={() => router.push(`/entry/${selectedId}/edit`)}
            onGone={() => setSelectedId(null)}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8" testID="vault-detail-placeholder">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-zinc-200 dark:bg-zinc-800">
              <Text className="text-2xl text-zinc-400 dark:text-zinc-500">🔒</Text>
            </View>
            <Text className="mt-4 text-lg font-semibold text-zinc-700 dark:text-zinc-300">
              Select a credential
            </Text>
            <Text className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Search on the left and pick an entry to view it here.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
