process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('../../services/EntryService', () => {
  const actual = jest.requireActual('../../services/EntryService');
  return {
    ...actual,
    EntryService: { create: jest.fn(), update: jest.fn(), remove: jest.fn(), list: jest.fn(), get: jest.fn() },
  };
});

import sodium, { ready } from '../../crypto/sodium';
import { EntryService } from '../../services/EntryService';
import { ApiError } from '../../api/errors';
import useVaultStore from '../../vault/vaultStore';
import { EntryEditor } from './EntryEditor';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeAll(async () => {
  await ready;
});

describe('EntryEditor', () => {
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

  it('blocks submission when the title (first line) is blank', async () => {
    const { getByTestId, findByText } = await renderWithClient(<EntryEditor mode="create" />);
    await fireEvent.changeText(getByTestId('entry-text'), '\nonly a body, no title');
    await fireEvent.press(getByTestId('entry-save'));

    await findByText(/enter a title/i);
    expect(EntryService.create).not.toHaveBeenCalled();
  });

  it('adds and removes tags', async () => {
    const { getByTestId, queryByTestId } = await renderWithClient(<EntryEditor mode="create" />);
    await fireEvent.changeText(getByTestId('tag-input'), 'banca');
    await fireEvent.press(getByTestId('tag-add'));

    expect(getByTestId('tag-chip-banca')).toBeTruthy();

    await fireEvent.press(getByTestId('tag-chip-banca'));
    expect(queryByTestId('tag-chip-banca')).toBeNull();
  });

  it('creates an entry with the parsed title/body and tags, then navigates back', async () => {
    (EntryService.create as jest.Mock).mockResolvedValue({
      id: 'e1',
      title: 'Bancamiga',
      body: 'user@x.com',
      tags: ['banca'],
      createdAt: 'a',
      updatedAt: 'a',
    });

    const { getByTestId } = await renderWithClient(<EntryEditor mode="create" />);
    await fireEvent.changeText(getByTestId('entry-text'), 'Bancamiga\nuser@x.com');
    await fireEvent.changeText(getByTestId('tag-input'), 'banca');
    await fireEvent.press(getByTestId('tag-add'));
    await fireEvent.press(getByTestId('entry-save'));

    await waitFor(() =>
      expect(EntryService.create).toHaveBeenCalledWith('Bancamiga', 'user@x.com', ['banca'], expect.anything()),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows a too-large message on 413', async () => {
    (EntryService.create as jest.Mock).mockRejectedValue(new ApiError('PAYLOAD_TOO_LARGE', 'Too large', 413));
    const { getByTestId, findByText } = await renderWithClient(<EntryEditor mode="create" />);
    await fireEvent.changeText(getByTestId('entry-text'), 'Title\nbody');
    await fireEvent.press(getByTestId('entry-save'));

    await findByText(/too large/i);
  });

  it('shows a not-found message on 404 when editing a deleted entry', async () => {
    (EntryService.update as jest.Mock).mockRejectedValue(new ApiError('NOT_FOUND', 'Entry not found', 404));
    const { getByTestId, findByText } = await renderWithClient(
      <EntryEditor
        mode="edit"
        entryId="e1"
        initialEntry={{ id: 'e1', title: 'Old', body: 'body', tags: [], createdAt: 'a', updatedAt: 'a' }}
      />,
    );
    await fireEvent.press(getByTestId('entry-save'));

    await findByText(/no longer exists/i);
  });
});
