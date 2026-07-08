process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

jest.mock('../api/auth', () => ({ refresh: jest.fn() }));
jest.mock('../platform/secureStore', () => ({
  __esModule: true,
  default: { isAvailable: jest.fn(() => true), read: jest.fn(), save: jest.fn(), remove: jest.fn() },
}));
jest.mock('../platform/biometric', () => ({
  __esModule: true,
  default: { isAvailable: jest.fn(), authenticate: jest.fn() },
}));

import sodium, { ready } from '../crypto/sodium';
import * as authApi from '../api/auth';
import secureStoreAdapter from '../platform/secureStore';
import biometricAdapter from '../platform/biometric';
import useVaultStore from './vaultStore';

const read = secureStoreAdapter.read as jest.Mock;
const isAvailable = biometricAdapter.isAvailable as jest.Mock;
const authenticate = biometricAdapter.authenticate as jest.Mock;
const refresh = authApi.refresh as jest.Mock;

let masterKeyB64: string;

beforeAll(async () => {
  await ready;
  masterKeyB64 = sodium.to_base64(sodium.randombytes_buf(32), sodium.base64_variants.ORIGINAL);
});

beforeEach(() => {
  jest.clearAllMocks();
  useVaultStore.setState({ status: 'locked', keys: null, entries: {}, tokens: null, error: null });
});

describe('unlockWithBiometrics (fingerprint every open)', () => {
  it('returns false WITHOUT prompting the fingerprint when there is no stored session', async () => {
    read.mockResolvedValue(null);

    const result = await useVaultStore.getState().unlockWithBiometrics();

    expect(result).toBe(false);
    expect(authenticate).not.toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe('locked');
  });

  it('always prompts the fingerprint and restores + refreshes on success', async () => {
    read.mockImplementation((key: string) =>
      Promise.resolve(key === 'hb.masterKey' ? masterKeyB64 : key === 'hb.refreshToken' ? 'stored-refresh' : null),
    );
    isAvailable.mockResolvedValue(true);
    authenticate.mockResolvedValue(true);
    refresh.mockResolvedValue({ accessToken: 'fresh-access', expiresIn: 3600 });

    const result = await useVaultStore.getState().unlockWithBiometrics();

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('stored-refresh');
    expect(result).toBe(true);
    const state = useVaultStore.getState();
    expect(state.status).toBe('unlocked');
    expect(state.tokens).toEqual({ accessToken: 'fresh-access', refreshToken: 'stored-refresh' });
  });

  it('stays locked when the fingerprint is rejected', async () => {
    read.mockImplementation((key: string) =>
      Promise.resolve(key === 'hb.masterKey' ? masterKeyB64 : key === 'hb.refreshToken' ? 'stored-refresh' : null),
    );
    isAvailable.mockResolvedValue(true);
    authenticate.mockResolvedValue(false);

    const result = await useVaultStore.getState().unlockWithBiometrics();

    expect(result).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe('locked');
  });
});
