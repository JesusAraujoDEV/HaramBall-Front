/**
 * Minimal surface of the libsodium API this app relies on, shared across the
 * web (`libsodium-wrappers-sumo`) and native (`react-native-libsodium`)
 * implementations so the rest of `src/crypto` never imports either package
 * directly.
 */
export interface SodiumApi {
  ready: Promise<void>;
  crypto_pwhash(
    keyLength: number,
    password: string | Uint8Array,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
    outputFormat?: 'uint8array',
  ): Uint8Array;
  crypto_pwhash_ALG_ARGON2ID13: number;
  crypto_pwhash_SALTBYTES: number;
  crypto_pwhash_OPSLIMIT_INTERACTIVE: number;
  crypto_pwhash_MEMLIMIT_INTERACTIVE: number;
  crypto_kdf_derive_from_key(
    subkeyLength: number,
    subkeyId: number | string,
    context: string,
    key: Uint8Array,
    outputFormat?: 'uint8array',
  ): Uint8Array;
  crypto_kdf_KEYBYTES: number;
  crypto_kdf_CONTEXTBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: string | Uint8Array,
    additionalData: Uint8Array | null,
    secretNonce: Uint8Array | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
    outputFormat?: 'uint8array',
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: Uint8Array | null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
    outputFormat?: 'text' | 'uint8array',
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;
  crypto_generichash(
    hashLength: number,
    message: string | Uint8Array,
    key?: Uint8Array | null,
    outputFormat?: 'uint8array',
  ): Uint8Array;
  crypto_generichash_KEYBYTES: number;
  randombytes_buf(length: number): Uint8Array;
  to_base64(input: Uint8Array | string, variant?: number): string;
  from_base64(input: string, variant?: number): Uint8Array;
  base64_variants: { ORIGINAL: number; URLSAFE_NO_PADDING: number };
}
