import { AppState, Platform, type AppStateStatus } from 'react-native';
import { getEnv } from '../config/env';
import useVaultStore from './vaultStore';

/**
 * Starts a configurable-timeout auto-lock: on native, an `AppState` listener
 * starts the timer when the app backgrounds/is inactive; on web, the
 * `visibilitychange` event does the equivalent. Returns an unsubscribe
 * function (Requirement 4.5).
 */
export function startAutolock(timeoutMs: number = getEnv().lockTimeoutMs): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleLock = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      useVaultStore.getState().lock();
    }, timeoutMs);
  };

  const cancelLock = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  if (Platform.OS === 'web') {
    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        scheduleLock();
      } else {
        cancelLock();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      cancelLock();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      scheduleLock();
    } else if (state === 'active') {
      cancelLock();
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    cancelLock();
    subscription.remove();
  };
}
