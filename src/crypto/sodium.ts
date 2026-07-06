import { Platform } from 'react-native';
import type { SodiumApi } from './sodiumApi';

/**
 * Single entry point selecting the libsodium implementation for the current
 * platform: `libsodium-wrappers-sumo` (pure JS/WASM, needed for Argon2id
 * `crypto_pwhash`) on web, `react-native-libsodium` (JSI native module) on
 * iOS/Android. Branching on `Platform.OS` (rather than relying on Metro's
 * `.native.ts`/`.web.ts` file resolution) keeps this testable under Jest,
 * where `Platform.OS` can be forced to `'web'` so tests run the functional
 * JS implementation instead of the native module (which has no bindings
 * available outside a real native runtime).
 */
function loadSodium(): SodiumApi {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('libsodium-wrappers-sumo') as SodiumApi;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-libsodium') as SodiumApi;
}

const sodium: SodiumApi = loadSodium();

/** Resolves once the underlying libsodium implementation has initialized. */
export const ready: Promise<void> = sodium.ready;

export default sodium;
