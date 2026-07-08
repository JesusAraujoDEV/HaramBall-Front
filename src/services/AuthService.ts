import * as authApi from '../api/auth';
import { deriveMasterKey, deriveSubkeys, deriveWrapKey } from '../crypto/kdf';
import {
  deriveRecoveryMaterial,
  generateRecoveryKey,
  generateVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
} from '../crypto/recovery';
import type { AuthTokens, SessionKeys } from './types';

export interface LoginResult {
  keys: SessionKeys;
  tokens: AuthTokens;
  /** Master_Key, returned only so the Vault store can persist it behind biometrics if the user opts in. Never sent anywhere. */
  masterKey: Uint8Array;
  /**
   * The random Vault Key that encrypts data, unwrapped from the account's
   * password-wrapped envelope. Null for legacy accounts that predate the
   * Recovery Kit (their data is still under password-derived keys).
   */
  vaultKey: Uint8Array | null;
  /** KEK derived from the password, used to (re)wrap the Vault Key. */
  passwordWrapKey: Uint8Array;
  /** True when a legacy account should be upgraded to the Vault Key model. */
  needsMigration: boolean;
}

export interface RegisterResult {
  /** The Recovery Key code to show the user once, to write down. */
  recoveryCode: string;
}

/**
 * Orchestrates registration/login/recovery. Derives keys locally and sends
 * only auth hashes + opaque wrapped-key envelopes to the backend, never the
 * Master_Password, Master_Key, Vault Key, or Recovery Key (Requirements 1.1,
 * 1.2, 1.3, 2.1, 2.2, 3.3; Recovery Kit zero-knowledge).
 */
export const AuthService = {
  async register(email: string, masterPassword: string): Promise<RegisterResult> {
    const masterKey = await deriveMasterKey(masterPassword, email);
    const { authHash } = deriveSubkeys(masterKey);
    const passwordWrapKey = deriveWrapKey(masterKey);

    // Random permanent Vault Key, wrapped independently by the password and by
    // a fresh Recovery Key.
    const vaultKey = generateVaultKey();
    const recovery = generateRecoveryKey();
    const { recoveryAuthHash, wrapKey: recoveryWrapKey } = await deriveRecoveryMaterial(recovery.canonical);

    await authApi.register(email, authHash, {
      wrappedVkPw: wrapVaultKey(vaultKey, passwordWrapKey),
      wrappedVkRk: wrapVaultKey(vaultKey, recoveryWrapKey),
      recoveryAuthHash,
    });

    return { recoveryCode: recovery.code };
  },

  async login(email: string, masterPassword: string, totpCode?: string): Promise<LoginResult> {
    const masterKey = await deriveMasterKey(masterPassword, email);
    const { authHash } = deriveSubkeys(masterKey);
    const passwordWrapKey = deriveWrapKey(masterKey);

    const response = await authApi.login(email, authHash, totpCode);
    const tokens: AuthTokens = { accessToken: response.accessToken, refreshToken: response.refreshToken };

    if (response.wrappedVkPw) {
      const vaultKey = unwrapVaultKey(response.wrappedVkPw, passwordWrapKey);
      const { encryptionKey, indexKey } = deriveSubkeys(vaultKey);
      return { keys: { encryptionKey, indexKey }, tokens, masterKey, vaultKey, passwordWrapKey, needsMigration: false };
    }

    // Legacy account: data is still encrypted under password-derived keys.
    const { encryptionKey, indexKey } = deriveSubkeys(masterKey);
    return {
      keys: { encryptionKey, indexKey },
      tokens,
      masterKey,
      vaultKey: null,
      passwordWrapKey,
      needsMigration: true,
    };
  },

  /**
   * Recovery login with the Recovery Key: unwraps the Vault Key via the
   * recovery-wrapped envelope, then sets a NEW password (rewrapping the same
   * Vault Key) so the user regains access without their old password.
   * Returns the session keys so the caller can unlock immediately.
   */
  async recoverAndResetPassword(
    email: string,
    recoveryCodeCanonical: string,
    newMasterPassword: string,
  ): Promise<LoginResult> {
    const { recoveryAuthHash, wrapKey: recoveryWrapKey } = await deriveRecoveryMaterial(recoveryCodeCanonical);
    const response = await authApi.recover(email, recoveryAuthHash);
    const tokens: AuthTokens = { accessToken: response.accessToken, refreshToken: response.refreshToken };

    const vaultKey = unwrapVaultKey(response.wrappedVkRk, recoveryWrapKey);

    // Set the new password credential + a fresh password-wrapped envelope of
    // the SAME Vault Key, so all existing data stays decryptable.
    const newMasterKey = await deriveMasterKey(newMasterPassword, email);
    const { authHash: newAuthHash } = deriveSubkeys(newMasterKey);
    const newPasswordWrapKey = deriveWrapKey(newMasterKey);
    await authApi.setPassword(newAuthHash, wrapVaultKey(vaultKey, newPasswordWrapKey));

    const { encryptionKey, indexKey } = deriveSubkeys(vaultKey);
    return {
      keys: { encryptionKey, indexKey },
      tokens,
      masterKey: newMasterKey,
      vaultKey,
      passwordWrapKey: newPasswordWrapKey,
      needsMigration: false,
    };
  },

  /**
   * Regenerates the Recovery Key for the current session's Vault Key and
   * pushes the new recovery-wrapped envelope + auth hash to the backend. The
   * previous Recovery Key stops working. Returns the new code to display.
   */
  async regenerateRecoveryKey(vaultKey: Uint8Array): Promise<string> {
    const recovery = generateRecoveryKey();
    const { recoveryAuthHash, wrapKey: recoveryWrapKey } = await deriveRecoveryMaterial(recovery.canonical);
    await authApi.setRecoveryKit(recoveryAuthHash, wrapVaultKey(vaultKey, recoveryWrapKey));
    return recovery.code;
  },

  async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Best-effort: even if the backend call fails (network, already
        // expired), local state must still be cleared by the caller.
      }
    }
  },
};

export default AuthService;
