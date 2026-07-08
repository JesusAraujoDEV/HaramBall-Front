process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import React from 'react';
import { render } from '@testing-library/react-native';

// Mock expo-router (same pattern as the other component tests): importing
// the real module at test time requires a browser `window.location`.
// `useSegments: () => []` places the overlay outside the `(auth)` group so
// its cover contract is what gets exercised.
jest.mock('expo-router', () => ({
  useSegments: () => [],
}));

import useVaultStore from '../vault/vaultStore';
import { LockOverlay } from './LockOverlay';

/**
 * Property 12: Locked implies no plaintext — while `status !== 'unlocked'`,
 * no decrypted entry content is present in any rendered component. This
 * test focuses on the overlay's own contract: it renders (covering
 * whatever's behind it) whenever the vault isn't fully unlocked, and never
 * renders decrypted entry content itself, only a static lock/unlocking
 * message.
 */
describe('LockOverlay (Property 12: locked implies no plaintext)', () => {
  afterEach(() => {
    useVaultStore.setState({ status: 'locked', keys: null, entries: {}, tokens: null, error: null });
  });

  it('renders the cover when locked', async () => {
    useVaultStore.setState({ status: 'locked' });
    const { getByTestId, queryByText } = await render(<LockOverlay />);
    expect(getByTestId('lock-overlay')).toBeTruthy();
    expect(queryByText('Vault locked')).toBeTruthy();
  });

  it('renders the cover while unlocking, without exposing any entry content', async () => {
    useVaultStore.setState({ status: 'unlocking' });
    const { getByTestId, queryByText } = await render(<LockOverlay />);
    expect(getByTestId('lock-overlay')).toBeTruthy();
    expect(queryByText('Unlocking…')).toBeTruthy();
  });

  it('renders nothing (no cover, no content) once unlocked', async () => {
    useVaultStore.setState({ status: 'unlocked' });
    const { queryByTestId } = await render(<LockOverlay />);
    expect(queryByTestId('lock-overlay')).toBeNull();
  });

  it('never renders decrypted entry titles/bodies even if present in the store while locked', async () => {
    useVaultStore.setState({
      status: 'locked',
      entries: {
        '1': { id: '1', title: 'Super Secret Title', body: 'Super Secret Body', tags: [], createdAt: 'a', updatedAt: 'a' },
      },
    });
    const { queryByText } = await render(<LockOverlay />);
    expect(queryByText('Super Secret Title')).toBeNull();
    expect(queryByText('Super Secret Body')).toBeNull();
  });
});
