import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as totpApi from '../../src/api/totp';
import type { TotpEnroll } from '../../src/api/totp';
import { toUserMessage } from '../../src/utils/errorMessages';

type Phase = 'loading' | 'enabled' | 'enroll' | 'done';

/**
 * TOTP (authenticator) management screen: shows current status, walks through
 * QR enrollment (scan with Google Authenticator / Authy), and confirms the
 * first code to enable the second factor. Reached from the vault header.
 */
export default function TotpScreen(): React.ReactElement {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [enroll, setEnroll] = useState<TotpEnroll | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { enabled } = await totpApi.status();
        setPhase(enabled ? 'enabled' : 'enroll');
      } catch (err) {
        setError(toUserMessage(err));
        setPhase('enroll');
      }
    })();
  }, []);

  async function startEnroll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setEnroll(await totpApi.enroll());
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await totpApi.verify(code.trim());
      setPhase('done');
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await totpApi.disable(code.trim());
      setCode('');
      setEnroll(null);
      setPhase('enroll');
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-zinc-100 dark:bg-zinc-950" keyboardShouldPersistTaps="handled">
      <View className="gap-5 p-4 pt-14">
        <Pressable onPress={() => router.back()} className="self-start" testID="totp-back">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">‹ Back</Text>
        </Pressable>
        <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Two-factor authentication
        </Text>
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          Adds a 6-digit code from your authenticator app (Google Authenticator, Authy…) on top of your
          master password when you log in.
        </Text>

        {phase === 'loading' ? (
          <ActivityIndicator color="#a1a1aa" />
        ) : null}

        {phase === 'enabled' ? (
          <View className="gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="font-medium text-zinc-900 dark:text-zinc-50">✅ TOTP is enabled</Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              Enter a current code to turn it off.
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor="#a1a1aa"
              keyboardType="number-pad"
              maxLength={6}
              className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-center text-lg tracking-[8px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              testID="totp-disable-code"
            />
            <Pressable
              onPress={disable}
              disabled={busy}
              className="items-center rounded-xl border border-red-300 py-3 disabled:opacity-60 dark:border-red-900"
              testID="totp-disable"
            >
              <Text className="font-semibold text-red-600 dark:text-red-400">Disable</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'enroll' && !enroll ? (
          <Pressable
            onPress={startEnroll}
            disabled={busy}
            className="items-center rounded-xl bg-zinc-900 py-3 active:opacity-80 disabled:opacity-60 dark:bg-zinc-50"
            testID="totp-start"
          >
            {busy ? (
              <ActivityIndicator color="#a1a1aa" />
            ) : (
              <Text className="font-semibold text-white dark:text-zinc-900">Set up authenticator</Text>
            )}
          </Pressable>
        ) : null}

        {phase === 'enroll' && enroll ? (
          <View className="gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              1. Scan this QR with your authenticator app:
            </Text>
            <View className="items-center">
              <Image
                source={{ uri: enroll.qrDataUrl }}
                style={{ width: 200, height: 200 }}
                resizeMode="contain"
                testID="totp-qr"
              />
            </View>
            <Text className="text-xs text-zinc-400 dark:text-zinc-500">
              Or enter this key manually:
            </Text>
            <Text selectable className="text-center font-mono text-sm text-zinc-700 dark:text-zinc-300">
              {enroll.secret}
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">2. Enter the current code:</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor="#a1a1aa"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-center text-lg tracking-[8px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              testID="totp-confirm-code"
            />
            <Pressable
              onPress={confirm}
              disabled={busy || code.trim().length !== 6}
              className="items-center rounded-xl bg-zinc-900 py-3 active:opacity-80 disabled:opacity-60 dark:bg-zinc-50"
              testID="totp-confirm"
            >
              <Text className="font-semibold text-white dark:text-zinc-900">Enable</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'done' ? (
          <View className="gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="font-medium text-zinc-900 dark:text-zinc-50">✅ Two-factor is now on</Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              You'll be asked for a code the next time you log in.
            </Text>
            <Pressable
              onPress={() => router.back()}
              className="items-center rounded-xl bg-zinc-900 py-3 dark:bg-zinc-50"
              testID="totp-done"
            >
              <Text className="font-semibold text-white dark:text-zinc-900">Done</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
      </View>
    </ScrollView>
  );
}
