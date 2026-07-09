import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import clipboardAdapter from '../platform/clipboard';

interface Props {
  code: string;
  testID?: string;
}

/**
 * Prominent one-time display of a Recovery Key, with a copy action, WhatsApp
 * share, and a clear "write this down" warning. Shown at registration, after
 * regenerating, and never retrievable again afterward (the app doesn't store
 * it).
 */
export function RecoveryCodeCard({ code, testID }: Props): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await clipboardAdapter.copy(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleWhatsApp(): void {
    const message = `🔐 HaramBall Recovery Key (guarda esto en un lugar seguro):\n\n${code}\n\n⚠️ No compartas este código con nadie. Es la única forma de recuperar tu bóveda si olvidas tu contraseña.`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    void Linking.openURL(url);
  }

  return (
    <View
      className="gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
      testID={testID ?? 'recovery-code-card'}
    >
      <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        ⚠️ Save your Recovery Key
      </Text>
      <Text className="text-sm leading-5 text-amber-800 dark:text-amber-300">
        Write this down and keep it safe. It's the only way to get back in if you forget your master
        password. We can't show it again or recover it for you.
      </Text>
      <View className="rounded-xl border border-amber-300 bg-white px-4 py-3 dark:border-amber-800 dark:bg-zinc-900">
        <Text selectable className="text-center font-mono text-base tracking-wider text-zinc-900 dark:text-zinc-50">
          {code}
        </Text>
      </View>
      <Pressable
        onPress={handleCopy}
        className="items-center rounded-xl border border-amber-400 py-2.5 active:opacity-70 dark:border-amber-700"
        testID="recovery-code-copy"
      >
        <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {copied ? 'Copied!' : 'Copy code'}
        </Text>
      </Pressable>
      <Pressable
        onPress={handleWhatsApp}
        className="flex-row items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 active:opacity-80 dark:bg-green-700"
        testID="recovery-code-whatsapp"
      >
        <Text className="text-lg">💬</Text>
        <Text className="text-sm font-semibold text-white">Save to WhatsApp</Text>
      </Pressable>
    </View>
  );
}

export default RecoveryCodeCard;
