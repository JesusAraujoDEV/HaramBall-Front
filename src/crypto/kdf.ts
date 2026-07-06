import sodium from './sodium';
import { normalize } from './normalize';
import {
  KDF_CONTEXT_AUTH,
  KDF_CONTEXT_ENCRYPTION,
  KDF_CONTEXT_INDEX,
  KDF_SALT_BYTES,
  KDF_SUBKEY_ID_AUTH,
  KDF_SUBKEY_ID_ENCRYPTION,
  KDF_SUBKEY_ID_INDEX,
  MASTER_KEY_BYTES,
  SUBKEY_BYTES,
} from './constants';

export interface SessionSubkeys {
  encryptionKey: Uint8Array;
  indexKey: Uint8Array;
  /** Base64. Sent to the backend as `Account_Password`; never the Master_Password. */
  authHash: string;
}

/**
 * Derives the Master_Key from the Master_Password using Argon2id, with a
 * deterministic per-user salt (`blake2b(normalize(email), len=16)`) so any
 * device can re-derive the same key without a server round-trip for a salt
 * (Requirements 5.1, 5.2, 1.1, 1.2, 2.1).
 */
export async function deriveMasterKey(
  masterPassword: string,
  email: string,
): Promise<Uint8Array> {
  await sodium.ready;

  const salt = sodium.crypto_generichash(KDF_SALT_BYTES, normalize(email));

  return sodium.crypto_pwhash(
    MASTER_KEY_BYTES,
    masterPassword,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
    'uint8array',
  );
}

/**
 * Derives the three domain-separated subkeys from the Master_Key using
 * `crypto_kdf_derive_from_key`. Each subkey uses a distinct subkey id and
 * 8-byte context, so none can be derived from the others without the
 * Master_Key itself (Property 7: Key Isolation; Requirements 5.2, 1.2).
 */
export function deriveSubkeys(masterKey: Uint8Array): SessionSubkeys {
  const encryptionKey = sodium.crypto_kdf_derive_from_key(
    SUBKEY_BYTES,
    KDF_SUBKEY_ID_ENCRYPTION,
    KDF_CONTEXT_ENCRYPTION,
    masterKey,
    'uint8array',
  );
  const indexKey = sodium.crypto_kdf_derive_from_key(
    SUBKEY_BYTES,
    KDF_SUBKEY_ID_INDEX,
    KDF_CONTEXT_INDEX,
    masterKey,
    'uint8array',
  );
  const authHashBytes = sodium.crypto_kdf_derive_from_key(
    SUBKEY_BYTES,
    KDF_SUBKEY_ID_AUTH,
    KDF_CONTEXT_AUTH,
    masterKey,
    'uint8array',
  );

  return {
    encryptionKey,
    indexKey,
    authHash: sodium.to_base64(authHashBytes, sodium.base64_variants.ORIGINAL),
  };
}
