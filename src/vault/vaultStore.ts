import { create } from 'zustand';
import sodium from '../crypto/sodium';
import { deriveSubkeys } from '../crypto/kdf';
import { AuthService } from '../services/AuthService';
import type { AuthTokens, PlainEntry, SessionKeys } from '../services/types';
import secureStoreAdapter from '../platform/secureStore';
import biometricAdapter from '../platform/biometric';
import * as authApi from '../api/auth';
import { tokenStore, setSessionExpiredHandler } from '../api/tokenStore';

const SECURE_STORE_MASTER_KEY = 'hb.masterKey';
const SECURE_STORE_REFRESH_TOKEN = 'hb.refreshToken';
const SECURE_STORE_EMAIL = 'hb.email';

export type VaultStatus = 'locked' | 'unlocking' | 'unlocked';

export interface VaultState {
  status: VaultStatus;
  keys: SessionKeys | null;
  entries: Record<string, PlainEntry>;
  tokens: AuthTokens | null;
  /** Set once a login/register/unlock call fails, for the UI to render; cleared on the next attempt. */
  error: string | null;

  unlockWithPassword(email: string, masterPassword: string, opts?: { enableBiometrics?: boolean }): Promise<void>;
  unlockWithBiometrics(): Promise<boolean>;
  lock(): void;
  logout(): Promise<void>;

  setEntries(entries: PlainEntry[]): void;
  upsertEntry(entry: PlainEntry): void;
  removeEntry(id: string): void;
}

/** Best-effort zeroing of key material so it doesn't linger in memory after lock (Requirement 5.5). */
function zero(bytes: Uint8Array | null | undefined): void {
  if (bytes) {
    bytes.fill(0);
  }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  status: 'locked',
  keys: null,
  entries: {},
  tokens: null,
  error: null,

  async unlockWithPassword(email, masterPassword, opts) {
    set({ status: 'unlocking', error: null });
    try {
      const { keys, tokens, masterKey } = await AuthService.login(email, masterPassword);

      tokenStore.setTokens(tokens);
      set({ status: 'unlocked', keys, tokens, entries: {}, error: null });

      if (opts?.enableBiometrics && secureStoreAdapter.isAvailable()) {
        try {
          const masterKeyB64 = sodium.to_base64(masterKey, sodium.base64_variants.ORIGINAL);
          await secureStoreAdapter.save(SECURE_STORE_MASTER_KEY, masterKeyB64);
          await secureStoreAdapter.save(SECURE_STORE_REFRESH_TOKEN, tokens.refreshToken);
          await secureStoreAdapter.save(SECURE_STORE_EMAIL, email);
        } catch {
          // Best-effort: biometric opt-in persistence failing must not block unlock.
        }
      }

      zero(masterKey);
    } catch (err) {
      set({ status: 'locked', error: err instanceof Error ? err.message : 'Login failed' });
      throw err;
    }
  },

  async unlockWithBiometrics() {
    if (!secureStoreAdapter.isAvailable()) {
      return false;
    }

    const available = await biometricAdapter.isAvailable();
    if (!available) {
      return false;
    }

    const authenticated = await biometricAdapter.authenticate('Unlock HaramBall');
    if (!authenticated) {
      return false;
    }

    set({ status: 'unlocking', error: null });
    try {
      const [masterKeyB64, refreshToken] = await Promise.all([
        secureStoreAdapter.read(SECURE_STORE_MASTER_KEY),
        secureStoreAdapter.read(SECURE_STORE_REFRESH_TOKEN),
      ]);

      if (!masterKeyB64 || !refreshToken) {
        set({ status: 'locked' });
        return false;
      }

      const masterKey = sodium.from_base64(masterKeyB64, sodium.base64_variants.ORIGINAL);
      const { encryptionKey, indexKey } = deriveSubkeys(masterKey);

      const refreshResult = await authApi.refresh(refreshToken);
      const tokens: AuthTokens = { accessToken: refreshResult.accessToken, refreshToken };

      tokenStore.setTokens(tokens);
      set({ status: 'unlocked', keys: { encryptionKey, indexKey }, tokens, entries: {}, error: null });

      zero(masterKey);
      return true;
    } catch (err) {
      set({ status: 'locked', error: err instanceof Error ? err.message : 'Biometric unlock failed' });
      return false;
    }
  },

  lock() {
    const { keys } = get();
    zero(keys?.encryptionKey);
    zero(keys?.indexKey);
    tokenStore.setTokens(null);
    set({ status: 'locked', keys: null, entries: {}, tokens: null });
  },

  async logout() {
    const { tokens, keys } = get();
    await AuthService.logout(tokens?.refreshToken ?? null);
    try {
      await secureStoreAdapter.remove(SECURE_STORE_MASTER_KEY);
      await secureStoreAdapter.remove(SECURE_STORE_REFRESH_TOKEN);
      await secureStoreAdapter.remove(SECURE_STORE_EMAIL);
    } catch {
      // Best-effort cleanup.
    }
    zero(keys?.encryptionKey);
    zero(keys?.indexKey);
    tokenStore.setTokens(null);
    set({ status: 'locked', keys: null, entries: {}, tokens: null, error: null });
  },

  setEntries(entries) {
    const map: Record<string, PlainEntry> = {};
    for (const entry of entries) {
      map[entry.id] = entry;
    }
    set({ entries: map });
  },

  upsertEntry(entry) {
    set((state) => ({ entries: { ...state.entries, [entry.id]: entry } }));
  },

  removeEntry(id) {
    set((state) => {
      const next = { ...state.entries };
      delete next[id];
      return { entries: next };
    });
  },
}));

// Wire the API client's session-expired callback (triggered on unrecoverable
// 401/refresh failure) to lock the vault, so UI routing to /login follows
// from `status !== 'unlocked'` (Requirements 3.1, 3.2).
setSessionExpiredHandler(() => {
  useVaultStore.getState().lock();
});

export default useVaultStore;
