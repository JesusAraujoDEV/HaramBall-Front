import { create } from 'zustand';
import { Platform } from 'react-native';
import { colorScheme } from 'nativewind';
import secureStoreAdapter from '../platform/secureStore';

/**
 * Theme preference: `system` follows the OS appearance; `light`/`dark`
 * force a scheme. Applied through NativeWind's `colorScheme` so every
 * `dark:` class variant updates reactively.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'hb.themePreference';

async function persist(pref: ThemePreference): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, pref);
    } else if (secureStoreAdapter.isAvailable()) {
      await secureStoreAdapter.save(STORAGE_KEY, pref);
    }
  } catch {
    // Best-effort: losing the theme preference is harmless.
  }
}

async function readPersisted(): Promise<ThemePreference | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(STORAGE_KEY);
    } else if (secureStoreAdapter.isAvailable()) {
      raw = await secureStoreAdapter.read(STORAGE_KEY);
    }
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
  } catch {
    return null;
  }
}

export interface ThemeState {
  preference: ThemePreference;
  setPreference(pref: ThemePreference): void;
  /** Cycles system → light → dark → system. */
  cycle(): void;
  /** Loads the persisted preference (called once from the root layout). */
  hydrate(): Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: 'system',

  setPreference(pref) {
    colorScheme.set(pref);
    set({ preference: pref });
    void persist(pref);
  },

  cycle() {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(get().preference) + 1) % order.length]!;
    get().setPreference(next);
  },

  async hydrate() {
    const saved = await readPersisted();
    if (saved) {
      colorScheme.set(saved);
      set({ preference: saved });
    }
  },
}));

export default useThemeStore;
