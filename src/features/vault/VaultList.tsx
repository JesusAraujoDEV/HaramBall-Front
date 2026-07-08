import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import useVaultStore from '../../vault/vaultStore';
import { EntryService } from '../../services/EntryService';
import { SearchService } from '../../services/SearchService';
import { SearchBar } from '../../ui/SearchBar';
import { EntryCard } from '../../ui/EntryCard';
import { ThemeToggle } from '../../ui/ThemeToggle';
import webauthnAdapter from '../../platform/webauthn';
import { toUserMessage } from '../../utils/errorMessages';
import type { PlainEntry } from '../../services/types';

interface Props {
  /** Overrides tap navigation (desktop split view selects in place). */
  onSelectEntry?: (entry: PlainEntry) => void;
}

/**
 * Web-only "add passkey" pill: registers a platform passkey (Touch ID /
 * Windows Hello) used for the daily re-verification gate.
 */
function PasskeyButton(): React.ReactElement | null {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  if (Platform.OS !== 'web' || !webauthnAdapter.isSupported()) {
    return null;
  }

  async function handlePress(): Promise<void> {
    setState('busy');
    try {
      const ok = await webauthnAdapter.registerPasskey();
      setState(ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 2500);
  }

  const label =
    state === 'busy' ? 'Waiting…' : state === 'done' ? 'Passkey added' : state === 'error' ? 'Failed' : 'Passkey';

  return (
    <Pressable
      onPress={handlePress}
      disabled={state === 'busy'}
      className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
      testID="vault-passkey"
      accessibilityRole="button"
      accessibilityLabel="Register a passkey"
    >
      <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</Text>
    </Pressable>
  );
}

/**
 * Vault home: fetches + decrypts entries via TanStack Query on unlock,
 * supports title search and tag filtering with debounce, and shows empty
 * states rather than errors for no-match cases (Requirements 7.1, 7.3, 7.5,
 * 10.1, 10.2, 10.4, 10.5, 10.6, 11.1-11.4).
 */
export function VaultList({ onSelectEntry }: Props = {}): React.ReactElement {
  const router = useRouter();
  const keys = useVaultStore((s) => s.keys);
  const lock = useVaultStore((s) => s.lock);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['entries', 'list'],
    queryFn: () => EntryService.list(keys!),
    enabled: keys !== null && query.trim().length === 0 && tagFilter === null,
  });

  const titleSearchQuery = useQuery({
    queryKey: ['entries', 'search', 'title', query],
    queryFn: () => SearchService.byTitle(query, keys!),
    enabled: keys !== null && query.trim().length > 0,
  });

  const tagSearchQuery = useQuery({
    queryKey: ['entries', 'search', 'tags', tagFilter],
    queryFn: () => SearchService.byTags([tagFilter as string], keys!),
    enabled: keys !== null && tagFilter !== null,
  });

  const isSearching = query.trim().length > 0;
  const isTagFiltering = tagFilter !== null;
  const activeQuery = isSearching ? titleSearchQuery : isTagFiltering ? tagSearchQuery : listQuery;

  const entries: PlainEntry[] = activeQuery.data ?? [];

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const entry of listQuery.data ?? []) {
      for (const tag of entry.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [listQuery.data]);

  function handleOpenEntry(entry: PlainEntry): void {
    if (onSelectEntry) {
      onSelectEntry(entry);
      return;
    }
    router.push(`/entry/${entry.id}`);
  }

  function clearSearch(): void {
    setQuery('');
  }

  function clearTagFilter(): void {
    setTagFilter(null);
  }

  return (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-14">
        <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Vault</Text>
        <View className="flex-row items-center gap-2">
          <PasskeyButton />
          <ThemeToggle />
          <Pressable
            onPress={lock}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
            testID="vault-lock"
            accessibilityRole="button"
            accessibilityLabel="Lock vault"
          >
            <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Lock</Text>
          </Pressable>
        </View>
      </View>

      <SearchBar value={query} onChangeDebounced={setQuery} testID="vault-search-bar" />

      {allTags.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-2 px-4 pb-3 pt-1">
          {allTags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => setTagFilter(tagFilter === tag ? null : tag)}
              testID={`tag-filter-${tag}`}
              className={`rounded-full px-3 py-1 ${
                tagFilter === tag
                  ? 'bg-zinc-900 dark:bg-zinc-50'
                  : 'border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
              }`}
            >
              <Text
                className={
                  tagFilter === tag
                    ? 'text-sm font-medium text-white dark:text-zinc-900'
                    : 'text-sm text-zinc-600 dark:text-zinc-400'
                }
              >
                {tag}
              </Text>
            </Pressable>
          ))}
          {tagFilter ? (
            <Pressable onPress={clearTagFilter} testID="tag-filter-clear">
              <Text className="text-sm text-zinc-500 underline dark:text-zinc-400">Clear filter</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isSearching ? (
        <Pressable onPress={clearSearch} className="px-4 pb-2">
          <Text className="text-sm text-zinc-500 underline dark:text-zinc-400">Clear search</Text>
        </Pressable>
      ) : null}

      {activeQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#a1a1aa" />
        </View>
      ) : activeQuery.isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-red-600 dark:text-red-400">{toUserMessage(activeQuery.error)}</Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6" testID="vault-empty-state">
          <Text className="text-center text-zinc-500 dark:text-zinc-400">
            {isSearching || isTagFiltering ? 'No matching entries.' : 'No entries yet. Create your first one.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EntryCard entry={item} onPress={handleOpenEntry} />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 96 }}
          testID="vault-list"
        />
      )}

      <Pressable
        onPress={() => router.push('/entry/new')}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-zinc-900 shadow-lg active:opacity-80 dark:bg-zinc-50"
        testID="vault-new-entry"
      >
        <Text className="text-2xl text-white dark:text-zinc-900">+</Text>
      </Pressable>
    </View>
  );
}

export default VaultList;
