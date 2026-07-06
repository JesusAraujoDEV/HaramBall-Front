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
      className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
      testID={testID ?? `field-copy-${label}`}
    >
      <View className="flex-1">
        <Text className="text-xs uppercase text-gray-400">{label}</Text>
        <Text className="text-base text-gray-900">{value}</Text>
      </View>
      <Text className="ml-2 text-blue-600">{copied ? 'Copied!' : 'Copy'}</Text>
    </Pressable>
  );
}

export default FieldCopyRow;
