import { Platform } from 'react-native';
import type { SodiumApi } from './sodiumApi';

/**
 * Single entry point for libsodium. Selects the implementation at runtime:
 *  - web / Node / Jest → `libsodium-wrappers-sumo` (WASM, works in browsers).
 *  - native (iOS/Android) → `react-native-libsodium` (JSI), because Hermes has
 *    no WebAssembly and the WASM build crashes the app on launch.
 *
 * Both are the real libsodium, so ciphertext/keys are byte-identical across
 * platforms. Branching on `Platform.OS` (mirroring `src/platform/secureStore`)
 * keeps this testable under Jest, which forces `Platform.OS = 'web'`.
 */
function loadSodium(): SodiumApi {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./sodiumWeb') as { default: SodiumApi }).default;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./sodiumNative') as { default: SodiumApi }).default;
}

const sodium: SodiumApi = loadSodium();

/** Resolves once the underlying libsodium implementation has initialized. */
export const ready: Promise<void> = sodium.ready;

export default sodium;
