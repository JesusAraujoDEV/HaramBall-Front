import sodium, { ready } from './sodium';

describe('sodium', () => {
  it('initializes and exposes the expected primitives', async () => {
    await ready;
    expect(typeof sodium.crypto_pwhash).toBe('function');
    expect(typeof sodium.crypto_kdf_derive_from_key).toBe('function');
    expect(typeof sodium.crypto_aead_xchacha20poly1305_ietf_encrypt).toBe('function');
    expect(typeof sodium.crypto_generichash).toBe('function');

    // Smoke-test that pwhash actually runs (would throw under the native
    // JSI binding with no native module registered).
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
    const key = sodium.crypto_pwhash(
      32,
      'test-password',
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE ?? 2,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE ?? 67108864,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
      'uint8array',
    );
    expect(key).toHaveLength(32);
  });
});
