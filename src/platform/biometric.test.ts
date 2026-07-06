jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

import * as LocalAuthentication from 'expo-local-authentication';
import { biometricAdapter as webAdapter } from './biometric.web';
import { biometricAdapter as nativeAdapter } from './biometric.native';

describe('biometric.web', () => {
  it('isAvailable() always reports false', async () => {
    await expect(webAdapter.isAvailable()).resolves.toBe(false);
  });

  it('authenticate() always reports false', async () => {
    await expect(webAdapter.authenticate('unlock')).resolves.toBe(false);
  });
});

describe('biometric.native', () => {
  it('isAvailable() delegates to expo-local-authentication', async () => {
    await expect(nativeAdapter.isAvailable()).resolves.toBe(true);
    expect(LocalAuthentication.hasHardwareAsync).toHaveBeenCalled();
    expect(LocalAuthentication.isEnrolledAsync).toHaveBeenCalled();
  });

  it('isAvailable() is false when no hardware is present', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValueOnce(false);
    await expect(nativeAdapter.isAvailable()).resolves.toBe(false);
  });

  it('authenticate() delegates to expo-local-authentication and returns success', async () => {
    await expect(nativeAdapter.authenticate('unlock your vault')).resolves.toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'unlock your vault' }),
    );
  });

  it('authenticate() returns false on cancel/failure', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValueOnce({ success: false });
    await expect(nativeAdapter.authenticate('unlock')).resolves.toBe(false);
  });
});
