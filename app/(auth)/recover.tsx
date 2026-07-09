import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import useVaultStore from '../../src/vault/vaultStore';
import { canonicalizeRecoveryCode } from '../../src/crypto/recovery';
import { ApiError } from '../../src/api/errors';
import { DecryptionError } from '../../src/crypto/errors';
import { toUserMessage } from '../../src/utils/errorMessages';
import { PasswordInput } from '../../src/ui/PasswordInput';

/**
 * Recovery flow: the user enters their email, Recovery Key, and a new master
 * password. The Recovery Key unwraps the Vault Key, a new password is set, and
 * the vault unlocks — all data stays intact (Recovery Kit).
 */
export default function RecoverScreen(): React.ReactElement {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const recoverWithKey = useVaultStore((s) => s.recoverWithKey);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current) return;
    setError(null);

    if (!email.includes('@')) {
      setError('Enter the email for your account.');
      return;
    }
    if (canonicalizeRecoveryCode(code).length < 10) {
      setError('Enter your full Recovery Key.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Your new master password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The passwords do not match.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await recoverWithKey(email.trim(), canonicalizeRecoveryCode(code), newPassword);
      // The auth gate navigates to the vault once the status is unlocked.
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('That Recovery Key or email is not correct.');
      } else if (err instanceof DecryptionError) {
        setError('That Recovery Key could not unlock your vault. Double-check it.');
      } else {
        setError(toUserMessage(err));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-zinc-100 dark:bg-zinc-950"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-md gap-5 self-center rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <View className="items-center">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Recover access</Text>
          <Text className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Use your Recovery Key to set a new master password. Your data stays intact.
          </Text>
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</Text>
          <TextInput
            className="h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            placeholder="you@example.com"
            placeholderTextColor="#a1a1aa"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="recover-email"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recovery Key</Text>
          <TextInput
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 font-mono text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            placeholder="HB-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor="#a1a1aa"
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
            testID="recover-code"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New master password</Text>
          <PasswordInput
            value={newPassword}
            onChangeText={setNewPassword}
            autoComplete="new-password"
            showGenerator
            testID="recover-password"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Confirm new password</Text>
          <PasswordInput
            value={confirm}
            onChangeText={setConfirm}
            autoComplete="new-password"
            testID="recover-confirm"
          />
        </View>

        {error ? (
          <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
            <Text className="text-sm text-red-700 dark:text-red-300">{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="h-12 items-center justify-center rounded-xl bg-zinc-900 disabled:opacity-60 dark:bg-zinc-50"
          testID="recover-submit"
        >
          {submitting ? (
            <ActivityIndicator color={colorScheme === 'dark' ? '#18181b' : '#fff'} />
          ) : (
            <Text className="text-base font-semibold text-white dark:text-zinc-900">Recover my vault</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace('/login')} className="py-1">
          <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">Back to log in</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
