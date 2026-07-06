import { Platform } from 'react-native';

/**
 * Interface implemented by `secureStore.native.ts` (wrapping
 * `expo-secure-store`, backed by iOS Keychain / Android Keystore) and
 * `secureStore.web.ts` (a no-op/throwing implementation so key material is
 * never persisted on Web — Requirements 4.4, 15.4).
 */
export interface SecureStoreAdapter {
  save(key: string, value: string): Promise<void>;
  read(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  isAvailable(): boolean;
}

/**
 * Runtime platform selection branching on `Platform.OS` (mirroring
 * `src/crypto/sodium.ts`) rather than relying solely on Metro's
 * `.native.ts`/`.web.ts` file resolution, so this module is also correctly
 * testable/importable under Jest (which does not apply Metro's platform
 * extension resolution by default) and by any code that imports the base
 * `./secureStore` path directly (e.g. the Vault store).
 */
function loadAdapter(): SecureStoreAdapter {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./secureStore.web') as { default: SecureStoreAdapter }).default;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./secureStore.native') as { default: SecureStoreAdapter }).default;
}

const secureStoreAdapter: SecureStoreAdapter = loadAdapter();

export default secureStoreAdapter;
