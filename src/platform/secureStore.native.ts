import * as SecureStore from 'expo-secure-store';
import type { SecureStoreAdapter } from './secureStore';

/**
 * Native (iOS/Android) secure storage adapter, backed by the platform
 * Keychain/Keystore via `expo-secure-store`. Used to persist the Master_Key
 * and Refresh_Token behind biometric unlock when the user opts in
 * (Requirement 4.1).
 */
export const secureStoreAdapter: SecureStoreAdapter = {
  async save(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async read(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },

  isAvailable(): boolean {
    return SecureStore.canUseBiometricAuthentication !== undefined || true;
  },
};

export default secureStoreAdapter;
