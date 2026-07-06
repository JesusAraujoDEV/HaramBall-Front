import * as authApi from '../api/auth';
import { deriveMasterKey, deriveSubkeys } from '../crypto/kdf';
import type { AuthTokens, SessionKeys } from './types';

export interface LoginResult {
  keys: SessionKeys;
  tokens: AuthTokens;
  /** Master_Key, returned only so the Vault store can persist it behind biometrics if the user opts in. Never sent anywhere. */
  masterKey: Uint8Array;
}

/**
 * Orchestrates registration/login/logout: derives keys locally and sends
 * only the Auth_Hash to the Backend, never the Master_Password or
 * Master_Key (Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 3.3).
 */
export const AuthService = {
  async register(email: string, masterPassword: string): Promise<void> {
    const masterKey = await deriveMasterKey(masterPassword, email);
    const { authHash } = deriveSubkeys(masterKey);
    await authApi.register(email, authHash);
  },

  async login(email: string, masterPassword: string): Promise<LoginResult> {
    const masterKey = await deriveMasterKey(masterPassword, email);
    const { encryptionKey, indexKey, authHash } = deriveSubkeys(masterKey);

    const response = await authApi.login(email, authHash);

    return {
      keys: { encryptionKey, indexKey },
      tokens: { accessToken: response.accessToken, refreshToken: response.refreshToken },
      masterKey,
    };
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
