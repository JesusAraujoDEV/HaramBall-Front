import type { SodiumApi } from './sodiumApi';

/**
 * Single entry point for the libsodium implementation. We use
 * `libsodium-wrappers-sumo` (pure JS/asm.js, includes Argon2id
 * `crypto_pwhash`) on **every** platform — web, iOS and Android.
 *
 * A single implementation everywhere guarantees that data encrypted on one
 * platform decrypts byte-for-byte on another (web ⇄ mobile), which the native
 * `react-native-libsodium` JSI module cannot guarantee against the JS build.
 * It also keeps the app free of custom native modules. The trade-off is that
 * Argon2id key derivation runs in JS on device and is slower than native.
 */
function loadSodium(): SodiumApi {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('libsodium-wrappers-sumo') as SodiumApi;
}

const sodium: SodiumApi = loadSodium();

/** Resolves once the underlying libsodium implementation has initialized. */
export const ready: Promise<void> = sodium.ready;

export default sodium;
