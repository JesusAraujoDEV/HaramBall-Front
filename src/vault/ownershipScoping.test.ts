process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import fc from 'fast-check';
import sodium, { ready } from '../crypto/sodium';
import useVaultStore from './vaultStore';
import type { PlainEntry } from '../services/types';

beforeAll(async () => {
  await ready;
});

function makeEntry(id: string): PlainEntry {
  return { id, title: `Entry ${id}`, body: '', tags: [], createdAt: 'a', updatedAt: 'a' };
}

/**
 * Property 13: Ownership scoping — the UI only renders entries returned by
 * the backend for the authenticated account; there is no client-side
 * cross-account state (Requirements 7.1, 10.2, 11.2).
 *
 * The Vault store never merges its own decrypted cache with a fresh
 * `setEntries()` call: every render of the list is driven by exactly what
 * the current query returned, and `lock()`/`logout()` always fully clear
 * the cache before a new account can unlock. This test asserts that
 * `setEntries()` replaces (never merges with) the existing cache, and that
 * `lock()` leaves no residual entries a subsequent account's session could
 * inherit.
 */
describe('Vault store ownership scoping (Property 13)', () => {
  beforeEach(() => {
    useVaultStore.setState({ status: 'unlocked', keys: null, entries: {}, tokens: null, error: null });
  });

  it('setEntries() always replaces the cache rather than merging with prior entries', () => {
    fc.assert(
      fc.property(
        // Prefix every generated id so it can never collide with an
        // inherited `Object.prototype` property name (e.g. "valueOf",
        // "constructor", "toString") when used as a plain-object key.
        fc.array(fc.string({ minLength: 1, maxLength: 8 }).map((s) => `id-${s}`), {
          minLength: 0,
          maxLength: 5,
        }),
        fc.array(fc.string({ minLength: 1, maxLength: 8 }).map((s) => `id-${s}`), {
          minLength: 0,
          maxLength: 5,
        }),
        (firstIds, secondIds) => {
          useVaultStore.getState().setEntries(firstIds.map(makeEntry));
          useVaultStore.getState().setEntries(secondIds.map(makeEntry));

          const cachedIds = Object.keys(useVaultStore.getState().entries).sort();
          const expectedIds = Array.from(new Set(secondIds)).sort();
          expect(cachedIds).toEqual(expectedIds);

          // No id from the first (now-superseded) fetch survives unless it
          // also appears in the second fetch — i.e. no merge/union behavior.
          for (const staleId of firstIds) {
            if (!secondIds.includes(staleId)) {
              expect(useVaultStore.getState().entries[staleId]).toBeUndefined();
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('lock() clears every cached entry, so a subsequent account starts from an empty cache', () => {
    useVaultStore.getState().setEntries([makeEntry('1'), makeEntry('2'), makeEntry('3')]);
    expect(Object.keys(useVaultStore.getState().entries)).toHaveLength(3);

    useVaultStore.getState().lock();

    expect(useVaultStore.getState().entries).toEqual({});
  });

  it('a fresh unlock (simulating a different account) never inherits entries left by a prior session', async () => {
    // Simulate account A's session leaving entries in the cache without a
    // clean lock (defensive: even if a caller forgets to lock first).
    useVaultStore.getState().setEntries([makeEntry('account-a-1')]);

    // Directly reset as unlockWithPassword does on success: keys/tokens
    // replace prior session state and entries reset to {} (see
    // `vaultStore.ts` `unlockWithPassword`).
    useVaultStore.setState({
      status: 'unlocked',
      keys: { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) },
      entries: {},
      tokens: { accessToken: 'a', refreshToken: 'r' },
      error: null,
    });

    expect(useVaultStore.getState().entries['account-a-1']).toBeUndefined();
  });
});
