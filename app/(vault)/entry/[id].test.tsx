process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'e1' }),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock('../../../src/services/EntryService', () => ({
  EntryService: { get: jest.fn(), remove: jest.fn() },
}));

import sodium, { ready } from '../../../src/crypto/sodium';
import { EntryService } from '../../../src/services/EntryService';
import useVaultStore from '../../../src/vault/vaultStore';
import EntryDetailScreen from './[id]';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeAll(async () => {
  await ready;
});

describe('EntryDetailScreen delete confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useVaultStore.setState({
      status: 'unlocked',
      keys: { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) },
      entries: {},
      tokens: null,
      error: null,
    });
    (EntryService.get as jest.Mock).mockResolvedValue({
      id: 'e1',
      title: 'Bancamiga',
      body: 'user@x.com\nPASSWORD123',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('asks for confirmation via Alert before deleting', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByTestId } = await renderWithClient(<EntryDetailScreen />);
    const deleteButton = await findByTestId('delete-entry');

    await fireEvent.press(deleteButton);

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete entry',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ]),
    );
    // Confirmation gates the call: EntryService.remove must not fire until
    // the destructive action is actually invoked.
    expect(EntryService.remove).not.toHaveBeenCalled();
  });

  it('deletes only after the destructive action is invoked', async () => {
    let destructiveAction: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      destructiveAction = buttons?.find((b) => b.style === 'destructive')?.onPress as (() => void) | undefined;
    });
    (EntryService.remove as jest.Mock).mockResolvedValue(undefined);

    const { findByTestId } = await renderWithClient(<EntryDetailScreen />);
    const deleteButton = await findByTestId('delete-entry');
    await fireEvent.press(deleteButton);

    expect(destructiveAction).toBeDefined();
    destructiveAction!();

    await waitFor(() => expect(EntryService.remove).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });
});
