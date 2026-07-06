process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

jest.mock('../services/AuthService');
jest.mock('../api/auth');

import sodium, { ready } from '../crypto/sodium';
import { AuthService } from '../services/AuthService';
import useVaultStore from './vaultStore';
import { tokenStore } from '../api/tokenStore';

beforeAll(async () => {
  await ready;
});

beforeEach(() => {
  jest.resetAllMocks();
  tokenStore.setTokens(null);
  useVaultStore.setState({ status: 'locked', keys: null, entries: {}, tokens: null, error: null });
});

describe('vaultStore', () => {
  it('unlockWithPassword() transitions to unlocked with keys and tokens set', async () => {
    const keys = { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) };
    (AuthService.login as jest.Mock).mockResolvedValue({
      keys,
      tokens: { accessToken: 'a', refreshToken: 'r' },
      masterKey: sodium.randombytes_buf(32),
    });

    await useVaultStore.getState().unlockWithPassword('user@example.com', 'password123456');

    const state = useVaultStore.getState();
    expect(state.status).toBe('unlocked');
    expect(state.keys).toEqual(keys);
    expect(state.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('unlockWithPassword() sets status back to locked and records an error on failure', async () => {
    (AuthService.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

    await expect(
      useVaultStore.getState().unlockWithPassword('user@example.com', 'wrongpassword'),
    ).rejects.toThrow();

    const state = useVaultStore.getState();
    expect(state.status).toBe('locked');
    expect(state.keys).toBeNull();
    expect(state.error).toBe('Invalid credentials');
  });

  describe('Property 11: lock() clears secrets', () => {
    it('sets keys to null and clears the decrypted entry cache', async () => {
      const keys = { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) };
      (AuthService.login as jest.Mock).mockResolvedValue({
        keys,
        tokens: { accessToken: 'a', refreshToken: 'r' },
        masterKey: sodium.randombytes_buf(32),
      });
      await useVaultStore.getState().unlockWithPassword('user@example.com', 'password123456');
      useVaultStore.getState().upsertEntry({
        id: '1',
        title: 'Secret Title',
        body: 'Secret Body',
        tags: [],
        createdAt: 'a',
        updatedAt: 'a',
      });

      expect(useVaultStore.getState().status).toBe('unlocked');
      expect(Object.keys(useVaultStore.getState().entries)).toHaveLength(1);

      useVaultStore.getState().lock();

      const state = useVaultStore.getState();
      expect(state.status).toBe('locked');
      expect(state.keys).toBeNull();
      expect(state.entries).toEqual({});
      expect(state.tokens).toBeNull();
    });

    it('zeroes the underlying key buffers so no residual key material remains readable', async () => {
      const encryptionKey = sodium.randombytes_buf(32);
      const indexKey = sodium.randombytes_buf(32);
      // Keep a reference to assert on after lock() zeroes the buffer in place.
      (AuthService.login as jest.Mock).mockResolvedValue({
        keys: { encryptionKey, indexKey },
        tokens: { accessToken: 'a', refreshToken: 'r' },
        masterKey: sodium.randombytes_buf(32),
      });
      await useVaultStore.getState().unlockWithPassword('user@example.com', 'password123456');

      useVaultStore.getState().lock();

      expect(encryptionKey.every((b) => b === 0)).toBe(true);
      expect(indexKey.every((b) => b === 0)).toBe(true);
    });
  });

  it('logout() calls AuthService.logout, clears tokens/keys, and locks', async () => {
    const keys = { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) };
    (AuthService.login as jest.Mock).mockResolvedValue({
      keys,
      tokens: { accessToken: 'a', refreshToken: 'r' },
      masterKey: sodium.randombytes_buf(32),
    });
    (AuthService.logout as jest.Mock).mockResolvedValue(undefined);
    await useVaultStore.getState().unlockWithPassword('user@example.com', 'password123456');

    await useVaultStore.getState().logout();

    expect(AuthService.logout).toHaveBeenCalledWith('r');
    const state = useVaultStore.getState();
    expect(state.status).toBe('locked');
    expect(state.keys).toBeNull();
    expect(state.tokens).toBeNull();
  });

  it('setEntries()/upsertEntry()/removeEntry() manage the decrypted cache', () => {
    const entry1 = { id: '1', title: 'A', body: '', tags: [], createdAt: 'a', updatedAt: 'a' };
    const entry2 = { id: '2', title: 'B', body: '', tags: [], createdAt: 'b', updatedAt: 'b' };
    useVaultStore.getState().setEntries([entry1, entry2]);
    expect(Object.keys(useVaultStore.getState().entries)).toHaveLength(2);

    useVaultStore.getState().removeEntry('1');
    expect(useVaultStore.getState().entries['1']).toBeUndefined();
    expect(useVaultStore.getState().entries['2']).toEqual(entry2);

    useVaultStore.getState().upsertEntry({ ...entry2, title: 'B-updated' });
    expect(useVaultStore.getState().entries['2']?.title).toBe('B-updated');
  });
});
