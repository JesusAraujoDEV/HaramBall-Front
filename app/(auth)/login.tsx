import React, { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LoginForm } from '../../src/features/auth/LoginForm';
import useVaultStore from '../../src/vault/vaultStore';

export default function LoginScreen(): React.ReactElement {
  const router = useRouter();
  const unlockWithBiometrics = useVaultStore((s) => s.unlockWithBiometrics);
  const attemptedRef = useRef(false);

  // Attempt a biometric/session resume once on mount: inside the 24 h
  // verification window this restores the vault silently; past it, the
  // platform biometric prompt appears. Failure just leaves the password form.
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    void (async () => {
      try {
        const unlocked = await unlockWithBiometrics();
        if (unlocked) router.replace('/');
      } catch {
        // Fall back to the password form.
      }
    })();
  }, [unlockWithBiometrics, router]);

  return (
    <ScrollView
      className="flex-1 bg-zinc-100 dark:bg-zinc-950"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}
    >
      <LoginForm />
    </ScrollView>
  );
}
