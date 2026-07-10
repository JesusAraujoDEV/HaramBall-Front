import type { SodiumApi } from './sodiumApi';

/**
 * Web implementation of the libsodium surface, backed by
 * `libsodium-wrappers-sumo` (pure JS/WASM). This runs in browsers and under
 * Node/Jest. It is NOT used on native devices: React Native's Hermes engine
 * has no WebAssembly, so the native bundle uses `sodium.native.ts`
 * (`react-native-libsodium`) instead. Both produce byte-identical output for
 * the same inputs, so data encrypted on one platform decrypts on the other.
 */
function loadSodium(): SodiumApi {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('libsodium-wrappers-sumo') as SodiumApi;
}

const sodium: SodiumApi = loadSodium();

export const ready: Promise<void> = sodium.ready;

export default sodium;
