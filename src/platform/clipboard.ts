import * as Clipboard from 'expo-clipboard';

export interface ClipboardAdapter {
  copy(value: string): Promise<void>;
  /**
   * Best-effort auto-clear: schedules a timeout that clears the clipboard
   * only if it still contains the value we copied (so we never clobber
   * something the user copied from elsewhere in the meantime).
   */
  scheduleClear(value: string, timeoutMs: number): void;
}

/**
 * Cross-platform clipboard adapter wrapping `expo-clipboard`, which works
 * uniformly on native and Web (Requirements 12.1, 12.4, 12.5).
 */
export const clipboardAdapter: ClipboardAdapter = {
  async copy(value: string): Promise<void> {
    await Clipboard.setStringAsync(value);
  },

  scheduleClear(value: string, timeoutMs: number): void {
    setTimeout(() => {
      void (async () => {
        try {
          const current = await Clipboard.getStringAsync();
          if (current === value) {
            await Clipboard.setStringAsync('');
          }
        } catch {
          // Best-effort: clipboard access can fail (e.g. no permission on
          // Web when the tab lost focus). Silently ignore.
        }
      })();
    }, timeoutMs);
  },
};

export default clipboardAdapter;
