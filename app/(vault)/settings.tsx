import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import useVaultStore from '../../src/vault/vaultStore';
import { RecoveryCodeCard } from '../../src/ui/RecoveryCodeCard';
import { toUserMessage } from '../../src/utils/errorMessages';

/**
 * Account settings: regenerate the Recovery Key (shows a fresh code to write
 * down and invalidates the old one) and log out.
 */
export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const vaultKey = useVaultStore((s) => s.vaultKey);
  const regenerateRecovery = useVaultStore((s) => s.regenerateRecovery);
  const logout = useVaultStore((s) => s.logout);

  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function confirmRegenerate(): void {
    const run = async () => {
      setBusy(true);
      setError(null);
      try {
        setNewCode(await regenerateRecovery());
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setBusy(false);
      }
    };
    Alert.alert(
      'New Recovery Key',
      'This creates a new Recovery Key and your current one stops working. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: () => void run() },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-zinc-100 dark:bg-zinc-950" keyboardShouldPersistTaps="handled">
      <View className="gap-5 p-4 pt-14">
        <Pressable onPress={() => router.back()} className="self-start" testID="settings-back">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">‹ Back</Text>
        </Pressable>
        <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Settings</Text>

        <View className="gap-3">
          <Text className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Recovery Key
          </Text>

          {newCode ? (
            <RecoveryCodeCard code={newCode} />
          ) : (
            <View className="gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                Lost your Recovery Key or want a new one to write down? Generate a fresh code. The old one
                will stop working.
              </Text>
              <Pressable
                onPress={confirmRegenerate}
                disabled={busy || !vaultKey}
                className="items-center rounded-xl bg-zinc-900 py-3 active:opacity-80 disabled:opacity-60 dark:bg-zinc-50"
                testID="settings-regenerate"
              >
                {busy ? (
                  <ActivityIndicator color="#a1a1aa" />
                ) : (
                  <Text className="font-semibold text-white dark:text-zinc-900">Generate new Recovery Key</Text>
                )}
              </Pressable>
              {!vaultKey ? (
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  Available once your vault is on the Recovery Kit (new accounts).
                </Text>
              ) : null}
            </View>
          )}

          {error ? <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
        </View>

        <Pressable
          onPress={() => {
            void logout().then(() => router.replace('/login'));
          }}
          className="items-center rounded-xl border border-red-300 py-3 active:bg-red-50 dark:border-red-900 dark:active:bg-red-950"
          testID="settings-logout"
        >
          <Text className="font-semibold text-red-600 dark:text-red-400">Log out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
