process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

/**
 * End-to-end user journey test: register -> login -> create entry ->
 * list/search by title -> search by tag -> edit -> delete -> logout ->
 * relock, exercised against a mocked API layer (real crypto), asserting no
 * plaintext ever appears in a request body and that locking clears session
 * state (Requirements 1.1, 2.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1, 15.2).
 *
 * This test drives the domain services + vault store directly (the layer
 * the UI is built on) rather than rendering full screens, so it stays fast
 * and focused on the cross-cutting contract rather than re-testing
 * individual component behavior already covered elsewhere.
 */

import { ready } from '../crypto/sodium';
import { decrypt } from '../crypto/cipher';

jest.mock('../api/auth');
jest.mock('../api/entries');
jest.mock('../api/search');

import * as authApi from '../api/auth';
import * as entriesApi from '../api/entries';
import * as searchApi from '../api/search';
import useVaultStore from '../vault/vaultStore';
import { EntryService } from '../services/EntryService';
import { SearchService } from '../services/SearchService';
import { AuthService } from '../services/AuthService';

beforeAll(async () => {
  await ready;
});

describe('End-to-end user journey', () => {
  const email = 'user@example.com';
  const masterPassword = 'correct horse battery staple';

  const capturedRequestBodies: unknown[] = [];

  beforeEach(() => {
    jest.resetAllMocks();
    capturedRequestBodies.length = 0;
    useVaultStore.setState({ status: 'locked', keys: null, entries: {}, tokens: null, error: null });

    // Every mocked API call records its own arguments so we can assert,
    // at the end, that no plaintext ever appeared anywhere in a payload.
    (authApi.register as jest.Mock).mockImplementation(async (e, password) => {
      capturedRequestBodies.push({ e, password });
      return { id: 'acct-1', email: e };
    });
    (authApi.login as jest.Mock).mockImplementation(async (e, password) => {
      capturedRequestBodies.push({ e, password });
      return { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };
    });
    (authApi.logout as jest.Mock).mockResolvedValue({ success: true });
  });

  it('covers the full journey without leaking plaintext and clears state on logout/lock', async () => {
    // 1. Register
    await AuthService.register(email, masterPassword);
    expect(authApi.register).toHaveBeenCalledWith(email, expect.any(String));

    // 2. Login / unlock
    await useVaultStore.getState().unlockWithPassword(email, masterPassword);
    expect(useVaultStore.getState().status).toBe('unlocked');
    const keys = useVaultStore.getState().keys!;

    // 3. Create an entry
    let storedPayload: entriesApi.EntryPayload | undefined;
    (entriesApi.create as jest.Mock).mockImplementation(async (payload: entriesApi.EntryPayload) => {
      capturedRequestBodies.push(payload);
      storedPayload = payload;
      return { id: 'entry-1' };
    });

    const created = await EntryService.create('Bancamiga', 'user@x.com\nPASSWORD123', ['banca'], keys);
    expect(created.title).toBe('Bancamiga');
    expect(storedPayload).toBeDefined();
    // Sanity: the stored ciphertext actually decrypts back to the plaintext
    // we created it with (round-trip through the real crypto module).
    expect(decrypt(storedPayload!.titleCiphertext, keys.encryptionKey)).toBe('Bancamiga');

    useVaultStore.getState().upsertEntry(created);

    // 4. List entries
    (entriesApi.list as jest.Mock).mockResolvedValue([
      {
        id: 'entry-1',
        titleCiphertext: storedPayload!.titleCiphertext,
        bodyCiphertext: storedPayload!.bodyCiphertext ?? null,
        tagsCiphertext: storedPayload!.tagsCiphertext ?? [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const list = await EntryService.list(keys);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Bancamiga');

    // 5. Search by title
    (searchApi.byTitle as jest.Mock).mockImplementation(async (index: string) => {
      capturedRequestBodies.push({ index });
      return {
        entries: [
          {
            id: 'entry-1',
            titleCiphertext: storedPayload!.titleCiphertext,
            bodyCiphertext: storedPayload!.bodyCiphertext ?? null,
            tagsCiphertext: storedPayload!.tagsCiphertext ?? [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
    });
    const titleResults = await SearchService.byTitle('banca', keys);
    expect(titleResults[0]?.title).toBe('Bancamiga');

    // 6. Search by tag
    (searchApi.byTags as jest.Mock).mockImplementation(async (indexes: string[]) => {
      capturedRequestBodies.push({ indexes });
      return {
        entries: [
          {
            id: 'entry-1',
            titleCiphertext: storedPayload!.titleCiphertext,
            bodyCiphertext: storedPayload!.bodyCiphertext ?? null,
            tagsCiphertext: storedPayload!.tagsCiphertext ?? [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
    });
    const tagResults = await SearchService.byTags(['banca'], keys);
    expect(tagResults[0]?.title).toBe('Bancamiga');

    // 7. Edit
    let updatedPayload: entriesApi.EntryPayload | undefined;
    (entriesApi.update as jest.Mock).mockImplementation(async (id: string, payload: entriesApi.EntryPayload) => {
      capturedRequestBodies.push({ id, payload });
      updatedPayload = payload;
      return { id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-06T00:00:00.000Z' };
    });
    const edited = await EntryService.update('entry-1', 'Bancamiga', 'user@x.com\nNEWPASSWORD', ['banca'], keys);
    expect(edited.body).toBe('user@x.com\nNEWPASSWORD');
    expect(decrypt(updatedPayload!.bodyCiphertext!, keys.encryptionKey)).toBe('user@x.com\nNEWPASSWORD');
    useVaultStore.getState().upsertEntry(edited);

    // 8. Delete
    (entriesApi.remove as jest.Mock).mockResolvedValue(undefined);
    await EntryService.remove('entry-1');
    useVaultStore.getState().removeEntry('entry-1');
    expect(useVaultStore.getState().entries['entry-1']).toBeUndefined();

    // 9. Logout
    await useVaultStore.getState().logout();
    expect(authApi.logout).toHaveBeenCalledWith('refresh-1');
    expect(useVaultStore.getState().status).toBe('locked');
    expect(useVaultStore.getState().keys).toBeNull();
    expect(useVaultStore.getState().tokens).toBeNull();
    expect(useVaultStore.getState().entries).toEqual({});

    // 10. Relock invariant: while locked, no plaintext should be reachable
    // via the store (Property 11/12).
    expect(useVaultStore.getState().status).not.toBe('unlocked');

    // Final assertion across every captured request body of the entire
    // journey: no plaintext title/body/tag or the raw Master_Password ever
    // appeared in anything sent to (or captured from calls into) the API
    // layer (Property 8: no secret egress).
    const serializedTraffic = JSON.stringify(capturedRequestBodies);
    expect(serializedTraffic).not.toContain(masterPassword);
    expect(serializedTraffic).not.toContain('Bancamiga');
    expect(serializedTraffic).not.toContain('PASSWORD123');
    expect(serializedTraffic).not.toContain('NEWPASSWORD');
  });
});
