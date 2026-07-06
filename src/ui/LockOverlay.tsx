import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import useVaultStore from '../vault/vaultStore';

/**
 * Full-screen cover shown whenever the Vault is not fully unlocked
 * (`status !== 'unlocked'`), including the moment the OS backgrounds the
 * app — this doubles as the app-switcher privacy cover (Requirements 4.6,
 * 15.2, 15.3). Rendered above the route tree in the root layout so no
 * decrypted content is ever visible underneath while locked/unlocking
 * (Property 12: locked implies no plaintext).
 */
export function LockOverlay(): React.ReactElement | null {
  const status = useVaultStore((s) => s.status);

  if (status === 'unlocked') {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-white"
      testID="lock-overlay"
    >
      <View className="items-center px-6">
        <Text className="text-2xl font-bold text-gray-900">HaramBall</Text>
        <Text className="mt-2 text-gray-500">
          {status === 'unlocking' ? 'Unlocking…' : 'Vault locked'}
        </Text>
      </View>
    </Animated.View>
  );
}

export default LockOverlay;
