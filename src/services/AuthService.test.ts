import { ready } from '../crypto/sodium';
import { deriveMasterKey, deriveSubkeys } from '../crypto/kdf';
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
