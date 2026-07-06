import type { SecureStoreAdapter } from './secureStore';

/**
 * Web secure storage adapter: intentionally never persists anything.
 * `localStorage`/`sessionStorage`/IndexedDB/cookies are all readable by any
 * script on the page (XSS) and are not acceptable places to keep key
 * material, so on Web the Master_Key lives only in memory for the session
 * (Requirements 4.4, 15.4; Property 9: No secret at rest on Web).
 */
export const secureStoreAdapter: SecureStoreAdapter = {
  async save(): Promise<void> {
    throw new Error('SecureStore is not available on Web; key material is memory-only.');
  },

  async read(): Promise<string | null> {
    return null;
  },

  async remove(): Promise<void> {
    // No-op: nothing is ever persisted to remove.
  },

  isAvailable(): boolean {
    return false;
  },
};

export default secureStoreAdapter;
