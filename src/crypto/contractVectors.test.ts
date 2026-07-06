/**
 * Known-answer contract vectors (Task 3.10). Fixes a password/email/title/
 * tag and asserts exact expected outputs via Jest snapshots so any
 * accidental change to the KDF, cipher envelope, or blind-index algorithm
 * is caught immediately rather than silently breaking cross-device/
 * cross-version compatibility.
 *
 * NOTE: `encrypt()` uses a fresh random nonce per call, so ciphertext is not
 * itself deterministic; instead we lock the *derived key material* and the
 * *blind-index* outputs, and verify round-trip + envelope shape for cipher.
 */
import { ready } from './sodium';
import { deriveMasterKey, deriveSubkeys } from './kdf';
import { blindIndex, buildTitlePrefixIndex } from './blindIndex';
import { encrypt, decrypt } from './cipher';

const FIXED_PASSWORD = 'ContractVectorPassword123!';
const FIXED_EMAIL = 'vector@haramball.test';
const FIXED_TITLE = 'Bancamiga Principal';
const FIXED_TAG = 'banca';

beforeAll(async () => {
  await ready;
});

describe('contract vectors', () => {
  it('locks the Master_Key/subkey derivation for a fixed password + email', async () => {
    const masterKey = await deriveMasterKey(FIXED_PASSWORD, FIXED_EMAIL);
    const { encryptionKey, indexKey, authHash } = deriveSubkeys(masterKey);

    expect(Buffer.from(encryptionKey).toString('base64')).toMatchSnapshot('encryptionKey');
    expect(Buffer.from(indexKey).toString('base64')).toMatchSnapshot('indexKey');
    expect(authHash).toMatchSnapshot('authHash');
  });

  it('locks the blind index for a fixed tag value', async () => {
    const masterKey = await deriveMasterKey(FIXED_PASSWORD, FIXED_EMAIL);
    const { indexKey } = deriveSubkeys(masterKey);

    expect(blindIndex(FIXED_TAG, indexKey)).toMatchSnapshot('tag-blind-index');
  });

  it('locks the title prefix index set for a fixed title', async () => {
    const masterKey = await deriveMasterKey(FIXED_PASSWORD, FIXED_EMAIL);
    const { indexKey } = deriveSubkeys(masterKey);

    const prefixIndex = buildTitlePrefixIndex(FIXED_TITLE, indexKey);
    // Real (non-padding) members are deterministic; padding is random, so we
    // snapshot the deterministic subset rather than the full padded array.
    const tokens = FIXED_TITLE.toLowerCase().split(/\s+/);
    const realMembers = new Set<string>();
    for (const token of tokens) {
      for (let k = 2; k <= token.length; k += 1) {
        realMembers.add(blindIndex(token.slice(0, k), indexKey));
      }
    }
    const sortedRealMembers = Array.from(realMembers).sort();

    expect(sortedRealMembers).toMatchSnapshot('title-prefix-real-members');
    for (const member of realMembers) {
      expect(prefixIndex).toContain(member);
    }
  });

  it('round-trips a fixed title through the cipher using the locked encryption key', async () => {
    const masterKey = await deriveMasterKey(FIXED_PASSWORD, FIXED_EMAIL);
    const { encryptionKey } = deriveSubkeys(masterKey);

    const envelope = encrypt(FIXED_TITLE, encryptionKey);
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(decrypt(envelope, encryptionKey)).toBe(FIXED_TITLE);
  });
});
