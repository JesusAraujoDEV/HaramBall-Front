jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ''),
}));

import * as Clipboard from 'expo-clipboard';
import { clipboardAdapter } from './clipboard';

describe('clipboardAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('copy() delegates to expo-clipboard setStringAsync', async () => {
    await clipboardAdapter.copy('my-password');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('my-password');
  });

  it('scheduleClear() clears the clipboard after the timeout if unchanged', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('my-password');

    clipboardAdapter.scheduleClear('my-password', 1000);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('');
  });

  it('scheduleClear() does not clobber clipboard contents that changed in the meantime', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('something-else');

    clipboardAdapter.scheduleClear('my-password', 1000);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(Clipboard.setStringAsync).not.toHaveBeenCalledWith('');
  });
});
