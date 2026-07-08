import React, { useEffect, useState } from 'react';
import { AppState, Platform, View, Text, StyleSheet, type AppStateStatus } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSegments } from 'expo-router';
import useVaultStore from '../vault/vaultStore';

/**
 * Tracks whether the OS is about to (or has just) taken the app-switcher
 * preview snapshot, so the privacy cover can render immediately on
 * `inactive`/`background` — independent of and ahead of the (potentially
 * much longer) autolock timeout (Requirement 15.3).
 */
function useNativeBackgroundCover(): boolean {
  const [backgrounded, setBackgrounded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handle = (state: AppStateStatus) => {
      setBackgrounded(state === 'inactive' || state === 'background');
    };
    const subscription = AppState.addEventListener('change', handle);
    return () => subscription.remove();
  }, []);

  return backgrounded;
}

/**
 * Full-screen cover shown whenever the Vault is not fully unlocked
 * (`status !== 'unlocked'`), or the moment the OS backgrounds/deactivates
 * the app (app-switcher privacy cover, ahead of the autolock timeout)
 * (Requirements 4.6, 15.2, 15.3). Rendered above the route tree in the root
 * layout so no decrypted content is ever visible underneath while
 * locked/unlocking/backgrounded (Property 12: locked implies no plaintext).
 */
export function LockOverlay(): React.ReactElement | null {
  const status = useVaultStore((s) => s.status);
  const backgrounded = useNativeBackgroundCover();
  const segments = useSegments();

  // The auth (login/register) screens render precisely while the vault is
  // locked/unlocking and contain no decrypted content to protect, so the
  // cover must not sit over them — otherwise it intercepts touches/keyboard
  // input and blocks the user from ever logging in (Property 12 still holds:
  // there is no plaintext underneath here).
  const inAuthGroup = segments[0] === '(auth)';

  if (inAuthGroup || (status === 'unlocked' && !backgrounded)) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-white dark:bg-zinc-950"
      testID="lock-overlay"
    >
      <View className="items-center px-6">
        <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-50">
          <Text className="text-2xl font-bold text-white dark:text-zinc-900">H</Text>
        </View>
        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">HaramBall</Text>
        {status !== 'unlocked' ? (
          <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
            {status === 'unlocking' ? 'Unlocking…' : 'Vault locked'}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default LockOverlay;
