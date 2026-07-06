process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('../../services/EntryService');
jest.mock('../../services/SearchService');

import sodium, { ready } from '../../crypto/sodium';
import { EntryService } from '../../services/EntryService';
import { SearchService } from '../../services/SearchService';
import useVaultStore from '../../vault/vaultStore';
import { VaultList } from './VaultList';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeAll(async () => {
  await ready;
});

describe('VaultList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useVaultStore.setState({
      status: 'unlocked',
      keys: { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) },
      entries: {},
      tokens: null,
      error: null,
    });
  });

  it('shows an empty state for no entries', async () => {
    (EntryService.list as jest.Mock).mockResolvedValue([]);
    const { findByTestId } = await renderWithClient(<VaultList />);
    await findByTestId('vault-empty-state');
  });

  it('renders the fetched entries in the list', async () => {
    (EntryService.list as jest.Mock).mockResolvedValue([
      { id: '1', title: 'Bancamiga', body: '', tags: [], createdAt: 'a', updatedAt: 'a' },
      { id: '2', title: 'Gmail', body: '', tags: [], createdAt: 'b', updatedAt: 'b' },
    ]);
    const { findByTestId } = await renderWithClient(<VaultList />);
    await findByTestId('entry-card-1');
    await findByTestId('entry-card-2');
  });

  it('shows a per-entry decrypt-error state without crashing the list', async () => {
    (EntryService.list as jest.Mock).mockResolvedValue([
      { id: '1', title: 'Good', body: '', tags: [], createdAt: 'a', updatedAt: 'a' },
      { id: '2', title: '', body: '', tags: [], createdAt: 'b', updatedAt: 'b', decryptError: true },
    ]);
    const { findByTestId, findByText } = await renderWithClient(<VaultList />);
    await findByTestId('entry-card-1');
    await findByText('Could not decrypt this entry');
  });

  it('shows an empty state for a title search with no results', async () => {
    jest.setTimeout(10000);
    (EntryService.list as jest.Mock).mockResolvedValue([
      { id: '1', title: 'Bancamiga', body: '', tags: [], createdAt: 'a', updatedAt: 'a' },
    ]);
    (SearchService.byTitle as jest.Mock).mockResolvedValue([]);

    const { getByTestId, findByTestId } = await renderWithClient(<VaultList />);
    await findByTestId('entry-card-1');

    await fireEvent.changeText(getByTestId('vault-search-bar'), 'zzz');

    await waitFor(() => expect(SearchService.byTitle).toHaveBeenCalledWith('zzz', expect.anything()), {
      timeout: 2000,
    });
    await findByTestId('vault-empty-state');
  });
});
