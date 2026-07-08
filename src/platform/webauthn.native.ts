import type { WebAuthnAdapter } from './webauthn';

/**
 * Native stub: passkeys are a web affordance here; native platforms use
 * `src/platform/biometric.native.ts` (Face ID / fingerprint) for the daily
 * re-verification gate instead.
 */
const webauthnNativeAdapter: WebAuthnAdapter = {
  isSupported(): boolean {
    return false;
  },
  registerPasskey(): Promise<boolean> {
    return Promise.resolve(false);
  },
  verifyPasskey(): Promise<boolean> {
    return Promise.resolve(false);
  },
};

export default webauthnNativeAdapter;
