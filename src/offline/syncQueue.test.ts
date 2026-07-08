process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));
jest.mock('../api/entries');

import * as entriesApi from '../api/entries';
import { ApiError, NetworkError } from '../api/errors';
import { getOfflineStore, __setOfflineStoreForTests } from './localDb';
import { processSyncQueue } from './syncQueue';
import type { EntryPayload } from '../api/entries';

const mockedApi = entriesApi as jest.Mocked<typeof entriesApi>;

function payload(title: string): EntryPayload {
  return { titleCiphertext: title, tagsCiphertext: [], titleBlindIndexes: [], tagBlindIndexes: [] };
}

describe('offline sync queue', () => {
  beforeEach(() => {
    // Fresh in-memory store per test (Platform.OS is 'web' under Jest).
    __setOfflineStoreForTests(null);
    jest.clearAllMocks();
  });

  it('drains pending ops sequentially (FIFO) and refreshes the cache', async () => {
    const offline = getOfflineStore();
    offline.enqueue('create', 'local-1', payload('c1'));
    offline.enqueue('update', 'server-9', payload('u1'));
    offline.enqueue('delete', 'server-8', null);

    mockedApi.create.mockResolvedValue({ id: 'server-new' });
    mockedApi.update.mockResolvedValue({
      id: 'server-9', titleCiphertext: 'u1', bodyCiphertext: null, tagsCiphertext: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    });
    mockedApi.remove.mockResolvedValue(undefined);
    mockedApi.list.mockResolvedValue([]);

    await processSyncQueue();

    expect(mockedApi.create).toHaveBeenCalledWith(payload('c1'));
    expect(mockedApi.update).toHaveBeenCalledWith('server-9', payload('u1'));
    expect(mockedApi.remove).toHaveBeenCalledWith('server-8');
    expect(mockedApi.list).toHaveBeenCalled();
    expect(offline.getPendingOps()).toHaveLength(0);
  });

  it('stops (keeping remaining ops) when still offline', async () => {
    const offline = getOfflineStore();
    offline.enqueue('create', 'local-1', payload('c1'));
    offline.enqueue('delete', 'server-8', null);

    mockedApi.create.mockRejectedValue(new NetworkError());

    await processSyncQueue();

    expect(offline.getPendingOps()).toHaveLength(2);
    expect(mockedApi.remove).not.toHaveBeenCalled();
    expect(mockedApi.list).not.toHaveBeenCalled();
  });

  it('discards ops whose target no longer exists (404) and continues', async () => {
    const offline = getOfflineStore();
    offline.enqueue('update', 'server-gone', payload('u1'));
    offline.enqueue('delete', 'server-8', null);

    mockedApi.update.mockRejectedValue(new ApiError('NOT_FOUND', 'gone', 404));
    mockedApi.remove.mockResolvedValue(undefined);
    mockedApi.list.mockResolvedValue([]);

    await processSyncQueue();

    expect(mockedApi.remove).toHaveBeenCalledWith('server-8');
    expect(offline.getPendingOps()).toHaveLength(0);
  });
});
