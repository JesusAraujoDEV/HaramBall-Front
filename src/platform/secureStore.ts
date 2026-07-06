/**
 * Interface implemented by `secureStore.native.ts` (wrapping
 * `expo-secure-store`, backed by iOS Keychain / Android Keystore) and
 * `secureStore.web.ts` (a no-op/throwing implementation so key material is
 * never persisted on Web — Requirements 4.4, 15.4).
 *
 * This file exists only to host the shared type; Metro/Jest resolve the
 * concrete `.native.ts` / `.web.ts` implementation for the actual `import
 * ... from './secureStore'` call sites.
 */
export interface SecureStoreAdapter {
  save(key: string, value: string): Promise<void>;
  read(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  isAvailable(): boolean;
}
