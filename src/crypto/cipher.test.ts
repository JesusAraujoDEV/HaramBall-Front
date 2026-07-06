import fc from 'fast-check';
import sodium, { ready } from './sodium';
import { encrypt, decrypt } from './cipher';
import { DecryptionError } from './errors';

const arbKey = () =>
  fc.uint8Array({ minLength: 32, maxLength: 32 }).map((arr) => new Uint8Array(arr));

beforeAll(async () => {
  await ready;
});

describe('cipher', () => {
  it('produces a versioned envelope', () => {
    const key = sodium.randombytes_buf(32);
    const envelope = encrypt('hello world', key);
    expect(envelope.startsWith('v1.')).toBe(true);
  });

  it('Property 1: encryption round-trip for any string and key', () => {
    fc.assert(
      fc.property(fc.string(), arbKey(), (message, key) => {
        const envelope = encrypt(message, key);
        expect(decrypt(envelope, key)).toBe(message);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 2: tamper-evidence — modifying any byte of the envelope throws', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), arbKey(), fc.nat(), (message, key, seed) => {
        const envelope = encrypt(message, key);
        const b64 = envelope.slice('v1.'.length);
        const raw = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
        const index = seed % raw.length;
        const tampered = new Uint8Array(raw);
        tampered[index] = (tampered[index]! + 1) % 256;
        const tamperedEnvelope = `v1.${sodium.to_base64(tampered, sodium.base64_variants.ORIGINAL)}`;

        expect(() => decrypt(tamperedEnvelope, key)).toThrow(DecryptionError);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 3: wrong-key safety — decrypting with a different key throws', () => {
    fc.assert(
      fc.property(fc.string(), arbKey(), arbKey(), (message, k1, k2) => {
        fc.pre(Buffer.from(k1).toString('hex') !== Buffer.from(k2).toString('hex'));
        const envelope = encrypt(message, k1);
        expect(() => decrypt(envelope, k2)).toThrow(DecryptionError);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects a malformed envelope (bad version prefix)', () => {
    const key = sodium.randombytes_buf(32);
    expect(() => decrypt('v2.abc123', key)).toThrow(DecryptionError);
  });

  it('rejects a malformed envelope (invalid base64)', () => {
    const key = sodium.randombytes_buf(32);
    expect(() => decrypt('v1.not-valid-base64!!!', key)).toThrow(DecryptionError);
  });

  it('rejects a truncated envelope shorter than the nonce', () => {
    const key = sodium.randombytes_buf(32);
    const shortB64 = sodium.to_base64(new Uint8Array(4), sodium.base64_variants.ORIGINAL);
    expect(() => decrypt(`v1.${shortB64}`, key)).toThrow(DecryptionError);
  });

  it('never returns plaintext on decryption failure (throws instead)', () => {
    const key = sodium.randombytes_buf(32);
    const otherKey = sodium.randombytes_buf(32);
    const envelope = encrypt('super-secret-password', key);
    let threw = false;
    try {
      decrypt(envelope, otherKey);
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(DecryptionError);
    }
    expect(threw).toBe(true);
  });
});
