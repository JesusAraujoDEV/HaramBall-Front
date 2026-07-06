import fc from 'fast-check';

process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import sodium, { ready } from '../crypto/sodium';
import { deriveMasterKey, deriveSubkeys } from '../crypto/kdf';
import { encrypt } from '../crypto/cipher';
import { blindIndex, buildTitlePrefixIndex } from '../crypto/blindIndex';
import * as authApi from './auth';
import * as entriesApi from './entries';
import * as searchApi from './search';
import { tokenStore } from './tokenStore';

/**
 * Property 8: No secret egress — no request body built by the API modules
 * contains the Master_Password, Master_Key, Encryption_Key, Index_Key, or
 * plaintext title/body/tag (Requirements 1.3, 2.1, 5.3).
 *
 * We intercept `fetch` and assert the serialized request body never
 * contains the raw secret material or plaintext, only their derived/opaque
 * forms (authHash, ciphertext envelopes, blind indexes).
 */

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeAll(async () => {
  await ready;
});

beforeEach(() => {
  tokenStore.setTokens({ accessToken: 'access', refreshToken: 'refresh' });
});

describe('Property 8: no secret egress', () => {
  it('register/login send only email + authHash, never the master password or master key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 12, maxLength: 40 }),
        fc.emailAddress(),
        async (masterPassword, email) => {
          const masterKey = await deriveMasterKey(masterPassword, email);
          const { authHash } = deriveSubkeys(masterKey);
          const masterKeyB64 = sodium.to_base64(masterKey, sodium.base64_variants.ORIGINAL);

          const bodies: string[] = [];
          jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
            bodies.push(String((init as RequestInit)?.body ?? ''));
            return jsonResponse(200, {
              id: 'x',
              email,
              accessToken: 'a',
              refreshToken: 'r',
              expiresIn: 900,
            });
          });

          await authApi.register(email, authHash);
          await authApi.login(email, authHash);

          for (const body of bodies) {
            expect(body).not.toContain(masterPassword);
            expect(body).not.toContain(masterKeyB64);
            expect(body).toContain(authHash);
          }

          jest.restoreAllMocks();
        },
      ),
      { numRuns: 25 },
    );
  });

  it('entry create/update payloads never contain plaintext title/body/tags', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
        async (title, body, tags) => {
          const encKey = sodium.randombytes_buf(32);
          const indexKey = sodium.randombytes_buf(32);

          const payload: entriesApi.EntryPayload = {
            titleCiphertext: encrypt(title, encKey),
            bodyCiphertext: body ? encrypt(body, encKey) : undefined,
            tagsCiphertext: tags.map((t) => encrypt(t, encKey)),
            titleBlindIndexes: buildTitlePrefixIndex(title, indexKey),
            tagBlindIndexes: tags.map((t) => blindIndex(t, indexKey)),
          };

          const bodies: string[] = [];
          jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
            bodies.push(String((init as RequestInit)?.body ?? ''));
            return jsonResponse(200, {
              id: 'e1',
              titleCiphertext: payload.titleCiphertext,
              bodyCiphertext: payload.bodyCiphertext ?? null,
              tagsCiphertext: payload.tagsCiphertext ?? [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          });

          await entriesApi.create(payload);
          await entriesApi.update('e1', payload);

          for (const sentBody of bodies) {
            if (title.length > 0) expect(sentBody).not.toContain(title);
            if (body.length > 0) expect(sentBody).not.toContain(body);
            for (const tag of tags) {
              expect(sentBody).not.toContain(tag);
            }
          }

          jest.restoreAllMocks();
        },
      ),
      { numRuns: 25 },
    );
  });

  it('search requests carry only the blind index of the query/tag, never the plaintext', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        async (query, tags) => {
          const indexKey = sodium.randombytes_buf(32);
          const queryIndex = blindIndex(query, indexKey);
          const tagIndexes = tags.map((t) => blindIndex(t, indexKey));

          const bodies: string[] = [];
          jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
            bodies.push(String((init as RequestInit)?.body ?? ''));
            return jsonResponse(200, { entries: [] });
          });

          await searchApi.byTitle(queryIndex);
          await searchApi.byTags(tagIndexes);

          for (const sentBody of bodies) {
            expect(sentBody).not.toContain(query);
            for (const tag of tags) {
              expect(sentBody).not.toContain(tag);
            }
          }

          jest.restoreAllMocks();
        },
      ),
      { numRuns: 25 },
    );
  });
});
