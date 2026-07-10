import {
  ready as rnReady,
  crypto_pwhash as rnPwhash,
  crypto_pwhash_ALG_ARGON2ID13,
  crypto_pwhash_SALTBYTES,
  crypto_pwhash_OPSLIMIT_INTERACTIVE,
  crypto_pwhash_MEMLIMIT_INTERACTIVE,
  crypto_kdf_derive_from_key as rnKdfDerive,
  crypto_kdf_KEYBYTES,
  crypto_kdf_CONTEXTBYTES,
  crypto_aead_xchacha20poly1305_ietf_encrypt as rnAeadEncrypt,
  crypto_aead_xchacha20poly1305_ietf_decrypt as rnAeadDecrypt,
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
  crypto_generichash as rnGenerichash,
  crypto_generichash_KEYBYTES,
  randombytes_buf as rnRandombytes,
  to_base64 as rnToBase64,
  from_base64 as rnFromBase64,
  to_string as rnToString,
  base64_variants as rnBase64Variants,
} from 'react-native-libsodium';
import type { SodiumApi } from './sodiumApi';

/**
 * Native (iOS/Android) implementation of the libsodium surface, backed by the
 * JSI-based `react-native-libsodium`. This works on Hermes (unlike the WASM
 * `libsodium-wrappers-sumo`, which crashes the app on launch) and runs the
 * real libsodium C library, so its output is byte-identical to the web build.
 *
 * Two small compatibility shims are needed because `react-native-libsodium`'s
 * partial bindings differ from `libsodium-wrappers`:
 *  1. AEAD `additional_data` must be a string — it throws on `null`. We pass
 *     `''` (an empty AD is byte-identical to a null AD in libsodium).
 *  2. AEAD decrypt cannot emit the `'text'` output format directly (it throws),
 *     so we decode the bytes to a UTF-8 string ourselves via `to_string`.
 */

/** Empty additional-data string; libsodium treats it identically to null AD. */
const NO_AD = '';

const sodium: SodiumApi = {
  ready: rnReady,

  crypto_pwhash: rnPwhash,
  crypto_pwhash_ALG_ARGON2ID13,
  crypto_pwhash_SALTBYTES,
  crypto_pwhash_OPSLIMIT_INTERACTIVE,
  crypto_pwhash_MEMLIMIT_INTERACTIVE,

  crypto_kdf_derive_from_key(subkeyLength, subkeyId, context, key) {
    // The app always uses numeric subkey ids; rn-libsodium types them as
    // number | bigint (no string), so narrow here.
    return rnKdfDerive(subkeyLength, subkeyId as number, context, key, 'uint8array');
  },
  crypto_kdf_KEYBYTES,
  crypto_kdf_CONTEXTBYTES,

  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES,

  crypto_generichash(hashLength, message, key) {
    return rnGenerichash(hashLength, message, key ?? null, 'uint8array');
  },
  crypto_generichash_KEYBYTES,

  randombytes_buf: rnRandombytes,
  to_base64: rnToBase64,
  from_base64: rnFromBase64,
  base64_variants: rnBase64Variants,

  crypto_aead_xchacha20poly1305_ietf_encrypt(message, additionalData, secretNonce, publicNonce, key) {
    return rnAeadEncrypt(
      message,
      typeof additionalData === 'string' ? additionalData : NO_AD,
      secretNonce,
      publicNonce,
      key,
      'uint8array',
    );
  },

  crypto_aead_xchacha20poly1305_ietf_decrypt(secretNonce, ciphertext, additionalData, publicNonce, key, outputFormat) {
    const bytes = rnAeadDecrypt(
      secretNonce,
      ciphertext,
      typeof additionalData === 'string' ? additionalData : NO_AD,
      publicNonce,
      key,
      'uint8array',
    );
    if (outputFormat === 'text') {
      // The caller (`cipher.decrypt`) casts the result to string; decode the
      // plaintext bytes as UTF-8 here since native cannot emit 'text' directly.
      return rnToString(bytes) as unknown as Uint8Array;
    }
    return bytes;
  },
};

export const ready: Promise<void> = sodium.ready;

export default sodium;
