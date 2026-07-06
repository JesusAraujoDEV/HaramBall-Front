import type { BiometricAdapter } from './biometric';

/**
 * Web biometric adapter: always unavailable. The Web platform has no
 * equivalent to Face ID / fingerprint unlock in this design, so callers
 * always fall back to Master_Password entry (Requirement 4.3).
 */
export const biometricAdapter: BiometricAdapter = {
  async isAvailable(): Promise<boolean> {
    return false;
  },

  async authenticate(): Promise<boolean> {
    return false;
  },
};

export default biometricAdapter;
