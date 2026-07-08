process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import { AppState } from 'react-native';
import useVaultStore from './vaultStore';
import { startAutolock } from './autolock';

jest.useFakeTimers();

describe('autolock (disabled: distraction never logs the user out)', () => {
  beforeEach(() => {
    useVaultStore.setState({ status: 'unlocked', keys: null, entries: {}, tokens: null, error: null });
  });

  it('returns a cleanup function', () => {
    const stop = startAutolock();
    expect(typeof stop).toBe('function');
    stop();
  });

  it('does NOT lock the vault when the app is backgrounded', () => {
    const stop = startAutolock();

    // Simulate a background/inactive/active cycle and let plenty of time pass.
    AppState.currentState = 'background';
    jest.advanceTimersByTime(10 * 60 * 1000);
    AppState.currentState = 'active';

    // The session stays unlocked — no auto-lock, no redirect to login.
    expect(useVaultStore.getState().status).toBe('unlocked');
    stop();
  });

  it('only the explicit lock() action locks the vault', () => {
    const stop = startAutolock();
    useVaultStore.getState().lock();
    expect(useVaultStore.getState().status).toBe('locked');
    stop();
  });
});
