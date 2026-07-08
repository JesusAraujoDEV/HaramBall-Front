import { create } from 'zustand';
import sodium from '../crypto/sodium';
import { deriveSubkeys } from '../crypto/kdf';
import { AuthService } from '../services/AuthService';
import type { AuthTokens, PlainEntry, SessionKeys } from '../services/types';
import secureStoreAdapter from '../platform/secureStore';
import biometricAdapter from '../platform/biometric';
import * as authApi from '../api/auth';
import { tokenStore, setSessionExpiredHandler } from '../api/tokenStore';
import { getOfflineStore } from '../offline/localDb';

const SECURE_STORE_MASTER_KEY = 'hb.masterKey';
const SECURE_STORE_REFRESH_TOKEN = 'hb.refreshToken';
const SECURE_STORE_EMAIL = 'hb.email';
const SECURE_STORE_VAULT_KEY = 'hb.vaultKey';

export type VaultStatus = 'locked' | 'unlocking' | 'unlocked';

export interface VaultState {
  status: VaultStatus;
  keys: SessionKeys | null;
  entries: Record<string, PlainEntry>;
  tokens: AuthTokens | null;
  /**
   * The in-memory Vault Key of the current session (Recovery Kit). Kept so
   * Settings can regenerate the Recovery Key without re-login. Null for legacy
   * accounts not yet on the Vault Key model.
   */
  vaultKey: Uint8Array | null;
  /** Set once a login/register/unlock call fails, for the UI to render; cleared on the next attempt. */
  error: string | null;

  unlockWithPassword(
    email: string,
    masterPassword: string,
    opts?: { enableBiometrics?: boolean; totpCode?: string },
  ): Promise<void>;
  unlockWithBiometrics(): Promise<boolean>;
  /** Recovery login: unlock with the Recovery Key and set a new password. */
  recoverWithKey(email: string, recoveryCodeCanonical: string, newMasterPassword: string): Promise<void>;
  /** Regenerates the Recovery Key for the current Vault Key; returns the new code to show. */
  regenerateRecovery(): Promise<string>;
  lock(): void;
  logout(): Promise<void>;

  setEntries(entries: PlainEntry[]): void;
  upsertEntry(entry: PlainEntry): void;
  removeEntry(id: string): void;
}

/**
 * Persists the session behind the platform keystore for biometric unlock,
 * including the Vault Key (when present) so a fingerprint restore derives the
 * correct data keys.
 */
async function persistBiometricSession(
  email: string,
  masterKey: Uint8Array,
  refreshToken: string,
  vaultKey: Uint8Array | null,
): Promise<void> {
  const masterKeyB64 = sodium.to_base64(masterKey, sodium.base64_variants.ORIGINAL);
  await secureStoreAdapter.save(SECURE_STORE_MASTER_KEY, masterKeyB64);
  await secureStoreAdapter.save(SECURE_STORE_REFRESH_TOKEN, refreshToken);
  await secureStoreAdapter.save(SECURE_STORE_EMAIL, email);
  if (vaultKey) {
    await secureStoreAdapter.save(
      SECURE_STORE_VAULT_KEY,
      sodium.to_base64(vaultKey, sodium.base64_variants.ORIGINAL),
    );
  } else {
    await secureStoreAdapter.remove(SECURE_STORE_VAULT_KEY);
  }
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
  vaultKey: null,
  error: null,

  async unlockWithPassword(email, masterPassword, opts) {
    set({ status: 'unlocking', error: null });
    try {
      const { keys, tokens, masterKey, vaultKey } = await AuthService.login(
        email,
        masterPassword,
        opts?.totpCode,
      );

      tokenStore.setTokens(tokens);
      set({ status: 'unlocked', keys, tokens, vaultKey, entries: {}, error: null });

      if (opts?.enableBiometrics && secureStoreAdapter.isAvailable()) {
        try {
          await persistBiometricSession(email, masterKey, tokens.refreshToken, vaultKey);
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

    // A stored session (master key + refresh token) is required — it is set
    // on the first master-password login. Read it BEFORE prompting so a fresh
    // install never shows a pointless fingerprint prompt with nothing to
    // restore.
    const [masterKeyB64, refreshToken, vaultKeyB64] = await Promise.all([
      secureStoreAdapter.read(SECURE_STORE_MASTER_KEY),
      secureStoreAdapter.read(SECURE_STORE_REFRESH_TOKEN),
      secureStoreAdapter.read(SECURE_STORE_VAULT_KEY),
    ]);
    if (!masterKeyB64 || !refreshToken) {
      return false;
    }

    // Every biometric unlock requires a fresh fingerprint/face confirmation
    // ("confirm it's me each time"). The fingerprint alone is sufficient to
    // restore the session and refresh the token — the master password is not
    // asked again until logout or refresh-token expiry.
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
      const masterKey = sodium.from_base64(masterKeyB64, sodium.base64_variants.ORIGINAL);
      // Data keys come from the Vault Key when present (Recovery Kit accounts),
      // otherwise from the master key (legacy accounts).
      const vaultKey = vaultKeyB64
        ? sodium.from_base64(vaultKeyB64, sodium.base64_variants.ORIGINAL)
        : null;
      const { encryptionKey, indexKey } = deriveSubkeys(vaultKey ?? masterKey);

      const refreshResult = await authApi.refresh(refreshToken);
      const tokens: AuthTokens = { accessToken: refreshResult.accessToken, refreshToken };

      tokenStore.setTokens(tokens);
      set({ status: 'unlocked', keys: { encryptionKey, indexKey }, tokens, vaultKey, entries: {}, error: null });

      zero(masterKey);
      return true;
    } catch (err) {
      set({ status: 'locked', error: err instanceof Error ? err.message : 'Biometric unlock failed' });
      return false;
    }
  },

  async recoverWithKey(email, recoveryCodeCanonical, newMasterPassword) {
    set({ status: 'unlocking', error: null });
    try {
      const { keys, tokens, masterKey, vaultKey } = await AuthService.recoverAndResetPassword(
        email,
        recoveryCodeCanonical,
        newMasterPassword,
      );
      tokenStore.setTokens(tokens);
      set({ status: 'unlocked', keys, tokens, vaultKey, entries: {}, error: null });
      if (secureStoreAdapter.isAvailable()) {
        try {
          await persistBiometricSession(email, masterKey, tokens.refreshToken, vaultKey);
        } catch {
          // Best-effort.
        }
      }
      zero(masterKey);
    } catch (err) {
      set({ status: 'locked', error: err instanceof Error ? err.message : 'Recovery failed' });
      throw err;
    }
  },

  async regenerateRecovery() {
    const { vaultKey } = get();
    if (!vaultKey) {
      throw new Error('Recovery Key is only available once your vault is on the Recovery Kit model.');
    }
    return AuthService.regenerateRecoveryKey(vaultKey);
  },

  lock() {
    const { keys, vaultKey } = get();
    zero(keys?.encryptionKey);
    zero(keys?.indexKey);
    zero(vaultKey);
    tokenStore.setTokens(null);
    set({ status: 'locked', keys: null, entries: {}, tokens: null, vaultKey: null });
  },

  async logout() {
    const { tokens, keys, vaultKey } = get();
    await AuthService.logout(tokens?.refreshToken ?? null);
    try {
      await secureStoreAdapter.remove(SECURE_STORE_MASTER_KEY);
      await secureStoreAdapter.remove(SECURE_STORE_REFRESH_TOKEN);
      await secureStoreAdapter.remove(SECURE_STORE_EMAIL);
      await secureStoreAdapter.remove(SECURE_STORE_VAULT_KEY);
    } catch {
      // Best-effort cleanup.
    }
    try {
      // Logout wipes the offline ciphertext cache and any queued changes.
      getOfflineStore().clearAll();
    } catch {
      // Best-effort cleanup.
    }
    zero(keys?.encryptionKey);
    zero(keys?.indexKey);
    zero(vaultKey);
    tokenStore.setTokens(null);
    set({ status: 'locked', keys: null, entries: {}, tokens: null, vaultKey: null, error: null });
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
