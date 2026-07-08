import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import useVaultStore from '../../vault/vaultStore';
import { EntryService } from '../../services/EntryService';
import { detectFields } from '../../utils/entryText';
import { FieldCopyRow } from '../../ui/FieldCopyRow';
import { toUserMessage } from '../../utils/errorMessages';
import type { PlainBodyVersion } from '../../services/types';

interface Props {
  entryId: string;
}

function VersionCard({ version, index }: { version: PlainBodyVersion; index: number }): React.ReactElement {
  const fields = detectFields(version.body);
  const changed = new Date(version.changedAt);

  return (
    <View
      className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      testID={`history-version-${index}`}
    >
      <View className="border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
        <Text className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Replaced {changed.toLocaleDateString()} · {changed.toLocaleTimeString()}
        </Text>
      </View>
      {version.decryptError ? (
        <Text className="px-4 py-3 text-sm text-red-600 dark:text-red-400">Could not decrypt this version</Text>
      ) : fields.length > 0 ? (
        fields.map((field, i) => (
          <FieldCopyRow
            key={`${field.label}-${i}`}
            label={field.label}
            value={field.value}
            testID={`history-${index}-field-${field.label}-${i}`}
          />
        ))
      ) : (
        <FieldCopyRow label="body" value={version.body} testID={`history-${index}-body`} />
      )}
    </View>
  );
}

/**
 * Collapsible "Previous versions" section for the entry detail screen.
 * Fetches lazily (only once opened) and decrypts each superseded body
 * client-side, offering the same per-field copy actions as the live entry.
 */
export function PasswordHistory({ entryId }: Props): React.ReactElement {
  const keys = useVaultStore((s) => s.keys);
  const [open, setOpen] = useState(false);

  const historyQuery = useQuery({
    queryKey: ['entries', 'history', entryId],
    queryFn: () => EntryService.history(entryId, keys!),
    enabled: open && keys !== null && !!entryId,
  });

  const versions = historyQuery.data ?? [];

  return (
    <View className="mt-6">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
        testID="history-toggle"
        accessibilityRole="button"
      >
        <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Previous versions</Text>
        <Text className="text-zinc-400 dark:text-zinc-500">{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open ? (
        historyQuery.isLoading ? (
          <View className="items-center py-4">
            <ActivityIndicator color="#a1a1aa" />
          </View>
        ) : historyQuery.isError ? (
          <Text className="mt-2 px-1 text-sm text-red-600 dark:text-red-400">
            {toUserMessage(historyQuery.error)}
          </Text>
        ) : versions.length === 0 ? (
          <Text className="mt-2 px-1 text-sm text-zinc-500 dark:text-zinc-400" testID="history-empty">
            No previous versions yet. Older values appear here after you edit this entry.
          </Text>
        ) : (
          versions.map((version, index) => <VersionCard key={version.id} version={version} index={index} />)
        )
      ) : null}
    </View>
  );
}

export default PasswordHistory;
