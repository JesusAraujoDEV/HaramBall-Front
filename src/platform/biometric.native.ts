import * as LocalAuthentication from 'expo-local-authentication';
import type { BiometricAdapter } from './biometric';

/**
 * Native (iOS/Android) biometric adapter wrapping `expo-local-authentication`
 * (Requirements 4.1, 4.2, 4.3).
 */
export const biometricAdapter: BiometricAdapter = {
  async isAvailable(): Promise<boolean> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return false;
    }
    return LocalAuthentication.isEnrolledAsync();
  },

  async authenticate(reason: string): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      disableDeviceFallback: false,
    });
    return result.success;
  },
};

export default biometricAdapter;
