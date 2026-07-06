import sodium from './sodium';
import { ENVELOPE_VERSION } from './constants';
import { DecryptionError } from './errors';

const NONCE_BYTES = 24; // crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
const ENVELOPE_PREFIX = `${ENVELOPE_VERSION}.`;

/**
 * Encrypts `plaintext` with XChaCha20-Poly1305 using a fresh random nonce,
 * returning the versioned envelope string `v1.<base64(nonce||ciphertext)>`
 * (Requirement 5.3).
 */
export function encrypt(plaintext: string, encryptionKey: Uint8Array): string {
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    encryptionKey,
    'uint8array',
  );

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return `${ENVELOPE_PREFIX}${sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)}`;
}

/**
 * Decrypts a `v1.<base64(nonce||ciphertext)>` envelope produced by
 * {@link encrypt}. Throws {@link DecryptionError} — never returns
 * plaintext — on a malformed envelope, an unsupported version prefix, or an
 * authentication failure (wrong key or tampered ciphertext); see
 * Properties 1-3 (round-trip, tamper-evidence, wrong-key safety) and
 * Requirement 5.4.
 */
export function decrypt(envelope: string, encryptionKey: Uint8Array): string {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new DecryptionError('Unsupported or malformed ciphertext envelope');
  }

  const b64 = envelope.slice(ENVELOPE_PREFIX.length);

  let raw: Uint8Array;
  try {
    raw = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
  } catch {
    throw new DecryptionError('Malformed ciphertext envelope');
  }

  if (raw.length < NONCE_BYTES) {
    throw new DecryptionError('Malformed ciphertext envelope');
  }

  const nonce = raw.slice(0, NONCE_BYTES);
  const ciphertext = raw.slice(NONCE_BYTES);

  try {
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      encryptionKey,
      'text',
    );
    return plaintext as unknown as string;
  } catch {
    throw new DecryptionError('Failed to decrypt: authentication failed');
  }
}
