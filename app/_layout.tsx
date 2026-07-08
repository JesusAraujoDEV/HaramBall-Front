import '../global.css';
import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ready as sodiumReady } from '../src/crypto/sodium';
import { getEnv } from '../src/config/env';
import useVaultStore from '../src/vault/vaultStore';
import useThemeStore from '../src/theme/themeStore';
import { startAutolock } from '../src/vault/autolock';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { LockOverlay } from '../src/ui/LockOverlay';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

/**
 * Routes to the `(auth)` group while locked/unlocking and `(vault)` group
 * once unlocked, so no vault screen can render without a valid session
 * (Requirements 3.5, 4.6).
 */
function useAuthGate(ready: boolean): void {
  const status = useVaultStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status !== 'unlocked' && !inAuthGroup) {
      router.replace('/login');
    } else if (status === 'unlocked' && inAuthGroup) {
      router.replace('/');
    }
  }, [ready, status, segments, router]);
}

export default function RootLayout(): React.ReactElement | null {
  const [ready, setReady] = useState(false);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      getEnv(); // fail fast on misconfiguration (Requirement 14.1, 15.5)
      await Promise.all([sodiumReady, hydrateTheme()]);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateTheme]);

  useEffect(() => {
    const stop = startAutolock();
    return stop;
  }, []);

  useAuthGate(ready);

  if (!ready) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            // Match the themed screen background so navigation transitions
            // never flash the platform default white.
            contentStyle: { backgroundColor: isDark ? '#09090b' : '#fafafa' },
          }}
        />
        <LockOverlay />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
