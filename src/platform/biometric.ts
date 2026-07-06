import { Platform } from 'react-native';

/**
 * Interface implemented by `biometric.native.ts` (wrapping
 * `expo-local-authentication`) and `biometric.web.ts` (always unavailable —
 * Web has no biometric unlock path).
 */
export interface BiometricAdapter {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
}

/**
 * Runtime platform selection branching on `Platform.OS` (mirroring
 * `src/crypto/sodium.ts` and `src/platform/secureStore.ts`) so this module
 * is testable/importable under Jest and by code that imports the base
 * `./biometric` path directly (e.g. the Vault store).
 */
function loadAdapter(): BiometricAdapter {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./biometric.web') as { default: BiometricAdapter }).default;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./biometric.native') as { default: BiometricAdapter }).default;
}

const biometricAdapter: BiometricAdapter = loadAdapter();

export default biometricAdapter;
