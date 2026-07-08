import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EntryDetail } from '../../../src/features/vault/EntryDetail';

/**
 * Mobile stacked route for the credential detail. The actual UI lives in
 * `src/features/vault/EntryDetail.tsx`, shared with the desktop dashboard.
 */
export default function EntryDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <EntryDetail
      entryId={id}
      onBack={() => router.back()}
      onEdit={() => router.push(`/entry/${id}/edit`)}
      onGone={() => {
        Alert.alert('Entry not found', 'This entry no longer exists.');
        router.replace('/');
      }}
    />
  );
}
