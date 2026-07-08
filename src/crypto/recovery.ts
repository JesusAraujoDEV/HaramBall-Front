import sodium from './sodium';
import { deriveSubkeys, deriveWrapKey } from './kdf';
import { encrypt, decrypt } from './cipher';
import { DecryptionError } from './errors';
import {
  KDF_SALT_BYTES,
  MASTER_KEY_BYTES,
  RECOVERY_CODE_PREFIX,
  RECOVERY_KDF_SALT_SEED,
  RECOVERY_KEY_BYTES,
  VAULT_KEY_BYTES,
} from './constants';

/**
 * Recovery Kit crypto (zero-knowledge). The random Vault Key encrypts all
 * data and never changes; it is wrapped independently by a key derived from
 * the master password and by one derived from the Recovery Key, so either can
 * unwrap it. The server only ever stores the opaque wrapped envelopes and a
 * hash of the recovery auth material — never the Vault Key or Recovery Key.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode (no padding; input length is a multiple of 5 bytes). */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export interface RecoveryKey {
  /** Grouped, human-writable code shown once, e.g. `HB-K7QF-9M2A-XR4T-...`. */
  code: string;
  /** Canonical (separator-free, uppercased) form used for key derivation. */
  canonical: string;
}

export interface RecoveryMaterial {
  /** Base64 auth material sent to the backend (stored only as its hash). */
  recoveryAuthHash: string;
  /** KEK that wraps/unwraps the Vault Key via the recovery path. */
  wrapKey: Uint8Array;
}

/** A fresh random Vault Key (the permanent data-encryption key). */
export function generateVaultKey(): Uint8Array {
  return sodium.randombytes_buf(VAULT_KEY_BYTES);
}

/** Formats a base32 payload as `HB-XXXX-XXXX-...` for display. */
function formatCode(payload: string): string {
  const groups = payload.match(/.{1,4}/g) ?? [];
  return `${RECOVERY_CODE_PREFIX}-${groups.join('-')}`;
}

/**
 * Normalizes user-entered text (any casing, spaces, or dashes) to the exact
 * canonical string used for derivation: `HB` + the base32 payload, uppercased.
 */
export function canonicalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

/** Generates a new Recovery Key (display code + canonical form). */
export function generateRecoveryKey(): RecoveryKey {
  const payload = base32Encode(sodium.randombytes_buf(RECOVERY_KEY_BYTES));
  const canonical = `${RECOVERY_CODE_PREFIX}${payload}`;
  return { code: formatCode(payload), canonical };
}

/**
 * Derives the recovery auth hash and wrap KEK from a canonical Recovery Key
 * string via Argon2id. The code is already high-entropy, so a fixed
 * deterministic salt is sufficient and lets any device re-derive identically.
 */
export async function deriveRecoveryMaterial(canonical: string): Promise<RecoveryMaterial> {
  await sodium.ready;
  const salt = sodium.crypto_generichash(KDF_SALT_BYTES, RECOVERY_KDF_SALT_SEED);
  const recoveryKey = sodium.crypto_pwhash(
    MASTER_KEY_BYTES,
    canonical,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
    'uint8array',
  );
  return {
    recoveryAuthHash: deriveSubkeys(recoveryKey).authHash,
    wrapKey: deriveWrapKey(recoveryKey),
  };
}

/**
 * Wraps the Vault Key under a KEK, producing an opaque envelope string safe to
 * store server-side. Reuses the audited XChaCha20-Poly1305 envelope by
 * encrypting the base64 of the raw key bytes.
 */
export function wrapVaultKey(vaultKey: Uint8Array, wrapKey: Uint8Array): string {
  return encrypt(sodium.to_base64(vaultKey, sodium.base64_variants.ORIGINAL), wrapKey);
}

/**
 * Unwraps a Vault Key envelope with a KEK. Throws {@link DecryptionError} on a
 * wrong KEK or tampered envelope (never returns a bogus key).
 */
export function unwrapVaultKey(envelope: string, wrapKey: Uint8Array): Uint8Array {
  const b64 = decrypt(envelope, wrapKey);
  const key = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
  if (key.length !== VAULT_KEY_BYTES) {
    throw new DecryptionError('Unwrapped Vault Key has an unexpected length');
  }
  return key;
}
