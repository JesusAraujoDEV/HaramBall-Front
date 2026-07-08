import { Platform } from 'react-native';

/**
 * Passkey (WebAuthn) adapter. On web it drives the browser's
 * `navigator.credentials` API against the backend `/webauthn` endpoints
 * (Touch ID / Windows Hello); on native it reports unsupported — native
 * platforms use the biometric adapter instead.
 *
 * Zero-knowledge note: a passkey verifies the user to the SERVER for the
 * daily re-verification gate. It cannot derive the vault encryption key —
 * initial decryption always requires the master password.
 */
export interface WebAuthnAdapter {
  isSupported(): boolean;
  /** Registers a new platform passkey for the authenticated account. */
  registerPasskey(): Promise<boolean>;
  /** Runs a passkey assertion; resolves true when the server verifies it. */
  verifyPasskey(): Promise<boolean>;
}

function loadAdapter(): WebAuthnAdapter {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./webauthn.web') as { default: WebAuthnAdapter }).default;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./webauthn.native') as { default: WebAuthnAdapter }).default;
}

const webauthnAdapter: WebAuthnAdapter = loadAdapter();

export default webauthnAdapter;
