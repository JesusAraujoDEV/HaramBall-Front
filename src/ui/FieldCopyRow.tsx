import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import clipboardAdapter from '../platform/clipboard';
import { getEnv } from '../config/env';

interface Props {
  label: string;
  value: string;
  testID?: string;
}

/**
 * A single detected field (e.g. Password, User, Email) with its own one-tap
 * Copy_Action, confirmation, and best-effort clipboard auto-clear
 * (Requirements 12.1-12.5).
 */
export function FieldCopyRow({ label, value, testID }: Props): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await clipboardAdapter.copy(value);
    clipboardAdapter.scheduleClear(value, getEnv().clipboardClearMs);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Pressable
      onPress={handleCopy}
      className="flex-row items-center justify-between border-b border-zinc-100 px-4 py-3 active:bg-zinc-50 dark:border-zinc-800 dark:active:bg-zinc-800"
      testID={testID ?? `field-copy-${label}`}
    >
      <View className="flex-1">
        <Text className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</Text>
        <Text className="mt-0.5 text-base text-zinc-900 dark:text-zinc-50">{value}</Text>
      </View>
      <View className="ml-2 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">
        <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{copied ? 'Copied!' : 'Copy'}</Text>
      </View>
    </Pressable>
  );
}

export default FieldCopyRow;
