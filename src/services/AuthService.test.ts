import { ready } from '../crypto/sodium';
import { deriveMasterKey, deriveSubkeys, deriveWrapKey } from '../crypto/kdf';
import {
  deriveRecoveryMaterial,
  generateRecoveryKey,
  generateVaultKey,
  wrapVaultKey,
} from '../crypto/recovery';
import * as authApi from '../api/auth';
import { AuthService } from './AuthService';

jest.mock('../api/auth');

beforeAll(async () => {
  await ready;
});

describe('AuthService', () => {
  const email = 'user@example.com';
  const masterPassword = 'correct horse battery staple';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('register() sends only the Auth_Hash as password, never the Master_Password', async () => {
    (authApi.register as jest.Mock).mockResolvedValue({ id: 'u1', email });

    await AuthService.register(email, masterPassword);

    expect(authApi.register).toHaveBeenCalledTimes(1);
    const [sentEmail, sentPassword] = (authApi.register as jest.Mock).mock.calls[0];
    expect(sentEmail).toBe(email);
    expect(sentPassword).not.toBe(masterPassword);

    const masterKey = await deriveMasterKey(masterPassword, email);
    const { authHash } = deriveSubkeys(masterKey);
    expect(sentPassword).toBe(authHash);
  });

  it('login() sends only the Auth_Hash and returns derived keys + tokens', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 900,
    });

    const result = await AuthService.login(email, masterPassword);

    const [sentEmail, sentPassword] = (authApi.login as jest.Mock).mock.calls[0];
    expect(sentEmail).toBe(email);
    expect(sentPassword).not.toBe(masterPassword);

    const masterKey = await deriveMasterKey(masterPassword, email);
    const { encryptionKey, indexKey, authHash } = deriveSubkeys(masterKey);
    expect(sentPassword).toBe(authHash);

    expect(result.tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(result.keys.encryptionKey).toEqual(encryptionKey);
    expect(result.keys.indexKey).toEqual(indexKey);
    expect(result.masterKey).toEqual(masterKey);
  });

  it('register() sends the Recovery Kit envelopes and returns a recovery code', async () => {
    (authApi.register as jest.Mock).mockResolvedValue({ id: 'u1', email });

    const { recoveryCode } = await AuthService.register(email, masterPassword);

    expect(recoveryCode).toMatch(/^HB-/);
    const kit = (authApi.register as jest.Mock).mock.calls[0][2];
    expect(kit.wrappedVkPw).toEqual(expect.any(String));
    expect(kit.wrappedVkRk).toEqual(expect.any(String));
    expect(kit.recoveryAuthHash).toEqual(expect.any(String));
    // The envelopes must not contain the plaintext password.
    expect(JSON.stringify(kit)).not.toContain(masterPassword);
  });

  it('login() unwraps the Vault Key envelope and derives data keys from it', async () => {
    const masterKey = await deriveMasterKey(masterPassword, email);
    const passwordWrapKey = deriveWrapKey(masterKey);
    const vaultKey = generateVaultKey();
    const wrappedVkPw = wrapVaultKey(vaultKey, passwordWrapKey);

    (authApi.login as jest.Mock).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      wrappedVkPw,
    });

    const result = await AuthService.login(email, masterPassword);

    expect(result.needsMigration).toBe(false);
    expect(result.vaultKey).toEqual(vaultKey);
    // Data keys come from the Vault Key, NOT the master key.
    expect(result.keys.encryptionKey).toEqual(deriveSubkeys(vaultKey).encryptionKey);
  });

  it('recoverAndResetPassword() unwraps via the recovery key and sets a new password', async () => {
    const vaultKey = generateVaultKey();
    const recovery = generateRecoveryKey();
    const { wrapKey: recoveryWrapKey } = await deriveRecoveryMaterial(recovery.canonical);
    const wrappedVkRk = wrapVaultKey(vaultKey, recoveryWrapKey);

    (authApi.recover as jest.Mock).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      wrappedVkRk,
    });
    (authApi.setPassword as jest.Mock).mockResolvedValue(undefined);

    const result = await AuthService.recoverAndResetPassword(email, recovery.canonical, 'a-new-strong-pass');

    expect(result.vaultKey).toEqual(vaultKey);
    expect(result.keys.encryptionKey).toEqual(deriveSubkeys(vaultKey).encryptionKey);
    // A fresh password-wrapped envelope of the SAME Vault Key was pushed.
    expect(authApi.setPassword).toHaveBeenCalledTimes(1);
  });

  it('regenerateRecoveryKey() pushes a new recovery envelope and returns a new code', async () => {
    (authApi.setRecoveryKit as jest.Mock).mockResolvedValue(undefined);
    const vaultKey = generateVaultKey();

    const code = await AuthService.regenerateRecoveryKey(vaultKey);

    expect(code).toMatch(/^HB-/);
    expect(authApi.setRecoveryKit).toHaveBeenCalledTimes(1);
  });

  it('logout() calls the API logout endpoint with the refresh token', async () => {
    (authApi.logout as jest.Mock).mockResolvedValue({ success: true });
    await AuthService.logout('refresh-1');
    expect(authApi.logout).toHaveBeenCalledWith('refresh-1');
  });

  it('logout() swallows API errors so local cleanup can still proceed', async () => {
    (authApi.logout as jest.Mock).mockRejectedValue(new Error('network down'));
    await expect(AuthService.logout('refresh-1')).resolves.toBeUndefined();
  });

  it('logout() is a no-op against the API when there is no refresh token', async () => {
    await AuthService.logout(null);
    expect(authApi.logout).not.toHaveBeenCalled();
  });
});
