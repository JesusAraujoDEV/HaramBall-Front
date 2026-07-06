process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import { AppState, Platform } from 'react-native';
import useVaultStore from './vaultStore';
import { startAutolock } from './autolock';

jest.useFakeTimers();

describe('autolock (native AppState)', () => {
  const originalPlatformOS = Platform.OS;
  let addEventListenerSpy: jest.SpiedFunction<typeof AppState.addEventListener>;
  let removeSpy: jest.Mock;

  beforeEach(() => {
    // jest.setup.ts forces Platform.OS = 'web' for crypto-module
    // testability; override it here to exercise the native AppState branch
    // of `startAutolock` (the web `visibilitychange` branch is exercised
    // separately below).
    Platform.OS = 'ios';
    removeSpy = jest.fn();
    addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: removeSpy }) as unknown as ReturnType<typeof AppState.addEventListener>);
    useVaultStore.setState({ status: 'unlocked', keys: null, entries: {}, tokens: null, error: null });
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    addEventListenerSpy.mockRestore();
  });

  it('locks after the configured timeout once backgrounded', () => {
    const stop = startAutolock(5000);

    // `AppState.addEventListener` may also be called by other framework
    // internals (e.g. NativeWind's appearance observer) during this test
    // run; `startAutolock`'s own subscription is always the most recent one
    // since it's registered last, inside this call.
    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1] as (s: string) => void;
    handler('background');
    jest.advanceTimersByTime(5001);

    expect(useVaultStore.getState().status).toBe('locked');
    stop();
  });

  it('does not lock if the app returns to active before the timeout', () => {
    const stop = startAutolock(5000);

    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1] as (s: string) => void;
    handler('background');
    jest.advanceTimersByTime(2000);
    handler('active');
    jest.advanceTimersByTime(5000);

    expect(useVaultStore.getState().status).toBe('unlocked');
    stop();
  });

  it('stop() unsubscribes and cancels any pending lock', () => {
    const stop = startAutolock(5000);

    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1] as (s: string) => void;
    handler('background');
    stop();
    jest.advanceTimersByTime(10000);

    expect(useVaultStore.getState().status).toBe('unlocked');
    expect(removeSpy).toHaveBeenCalled();
  });
});

describe('autolock (web visibilitychange)', () => {
  // The RN Jest environment has no DOM/`document` global; stub the minimal
  // subset `startAutolock`'s web branch touches so this test doesn't depend
  // on a jsdom test environment.
  let listeners: Record<string, () => void>;
  let visibilityState: 'visible' | 'hidden';
  let fakeDocument: {
    visibilityState: 'visible' | 'hidden';
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
  };

  beforeEach(() => {
    Platform.OS = 'web';
    useVaultStore.setState({ status: 'unlocked', keys: null, entries: {}, tokens: null, error: null });

    listeners = {};
    visibilityState = 'visible';
    fakeDocument = {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: jest.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
      removeEventListener: jest.fn((event: string) => {
        delete listeners[event];
      }),
    };
    (global as unknown as { document: unknown }).document = fakeDocument;
  });

  afterEach(() => {
    Platform.OS = 'web';
    delete (global as unknown as { document?: unknown }).document;
  });

  function fireVisibilityChange(next: 'visible' | 'hidden') {
    visibilityState = next;
    listeners.visibilitychange?.();
  }

  it('locks after the configured timeout once the tab becomes hidden', () => {
    const stop = startAutolock(5000);

    fireVisibilityChange('hidden');
    jest.advanceTimersByTime(5001);

    expect(useVaultStore.getState().status).toBe('locked');
    stop();
  });

  it('does not lock if the tab becomes visible again before the timeout', () => {
    const stop = startAutolock(5000);

    fireVisibilityChange('hidden');
    jest.advanceTimersByTime(2000);
    fireVisibilityChange('visible');
    jest.advanceTimersByTime(5000);

    expect(useVaultStore.getState().status).toBe('unlocked');
    stop();
  });
});
