/**
 * Pinned cryptographic constants. Changing any of these values changes the
 * wire contract (KDF output, ciphertext envelope, or blind-index values) and
 * requires a versioned re-encryption migration (see design "Versioning &
 * Migration"). Not env-driven, to guarantee identical derivation across
 * devices and platforms.
 */

/** Envelope version prefix on every ciphertext string, e.g. `v1.<base64>`. */
export const ENVELOPE_VERSION = 'v1';

/**
 * Argon2id parameters for Master_Key derivation. "Interactive" profile is a
 * balance of client-side responsiveness and cost-of-attack; pinned rather
 * than read from the environment so all devices derive identical keys for
 * the same Master_Password + email.
 */
export const ARGON2_OPSLIMIT_NAME = 'INTERACTIVE' as const;
export const ARGON2_MEMLIMIT_NAME = 'INTERACTIVE' as const;

/** Output length (bytes) of the derived Master_Key. */
export const MASTER_KEY_BYTES = 32;

/** Output length (bytes) of the deterministic per-user KDF salt. */
export const KDF_SALT_BYTES = 16;

/**
 * Domain-separated 8-byte `crypto_kdf` contexts. Each subkey is derived from
 * the Master_Key using `crypto_kdf_derive_from_key`, keyed by a distinct
 * subkey id and context so none can be derived from another without the
 * Master_Key itself (Property 7: Key Isolation).
 */
export const KDF_CONTEXT_ENCRYPTION = 'hb-enc__';
export const KDF_CONTEXT_INDEX = 'hb-idx__';
export const KDF_CONTEXT_AUTH = 'hb-auth_';
/**
 * Context for the key-encryption-key (KEK) that wraps the random Vault Key.
 * Derived from the password- or recovery-derived Argon2 key; the KEK never
 * encrypts data directly, only the Vault Key envelope (Recovery Kit).
 */
export const KDF_CONTEXT_WRAP = 'hb-wrap_';

export const KDF_SUBKEY_ID_ENCRYPTION = 1;
export const KDF_SUBKEY_ID_INDEX = 2;
export const KDF_SUBKEY_ID_AUTH = 3;
export const KDF_SUBKEY_ID_WRAP = 4;

/** Output length (bytes) of the random Vault Key that encrypts all data. */
export const VAULT_KEY_BYTES = 32;

/**
 * Number of random bytes behind a Recovery Key. 15 bytes = 120 bits, encoded
 * as 24 base32 chars and shown grouped (`HB-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`)
 * for the user to write down. High-entropy enough that the grouped code needs
 * no extra stretching beyond the Argon2 pass applied on use.
 */
export const RECOVERY_KEY_BYTES = 15;

/** Fixed seed for the Recovery Key's Argon2 salt (the code is already high-entropy). */
export const RECOVERY_KDF_SALT_SEED = 'haramball-recovery-key-v1';

/** Label prefix shown/stored with a Recovery Key code. */
export const RECOVERY_CODE_PREFIX = 'HB';

/** Output length (bytes) of each derived subkey. */
export const SUBKEY_BYTES = 32;

/** Minimum prefix length (in normalized characters) indexed for title search. */
export const MIN_PREFIX = 2;

/**
 * Privacy padding bucket size: the title prefix index set is padded with
 * random 16-byte indexes to a multiple of this size so the server cannot
 * infer exact title length from the number of stored prefixes.
 */
export const PAD_BUCKET = 16;

/** Output length (bytes) of a single blind-index value (keyed BLAKE2b). */
export const BLIND_INDEX_BYTES = 16;
