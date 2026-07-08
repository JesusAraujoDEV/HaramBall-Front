import React, { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { LoginForm } from '../../src/features/auth/LoginForm';
import useVaultStore from '../../src/vault/vaultStore';

export default function LoginScreen(): React.ReactElement {
  const unlockWithBiometrics = useVaultStore((s) => s.unlockWithBiometrics);
  const attemptedRef = useRef(false);

  // Attempt a biometric/session resume once on mount. On success the vault
  // status flips to "unlocked" and the root layout's auth gate navigates to
  // the vault; failure just leaves the password form. Navigation is never
  // done here to avoid a double-replace race with the gate.
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    void unlockWithBiometrics().catch(() => {
      // Fall back to the password form.
    });
  }, [unlockWithBiometrics]);

  return (
    <ScrollView
      className="flex-1 bg-zinc-100 dark:bg-zinc-950"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}
    >
      <LoginForm />
    </ScrollView>
  );
}
