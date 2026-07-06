process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import useVaultStore, { type VaultState } from '../../vault/vaultStore';
import { ApiError } from '../../api/errors';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useVaultStore.setState({ status: 'locked', keys: null, entries: {}, tokens: null, error: null });
  });

  it('blocks submission and shows a message for an invalid email', async () => {
    const { getByTestId, findByText } = await render(<LoginForm />);
    fireEvent.changeText(getByTestId('login-email'), 'not-an-email');
    fireEvent.changeText(getByTestId('login-password'), 'anything');
    fireEvent.press(getByTestId('login-submit'));

    await findByText(/valid email/i);
  });

  it('shows a generic message on 401 without revealing whether the email exists', async () => {
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 'Invalid credentials', 401));
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId, findByText } = await render(<LoginForm />);
    fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('login-password'), 'wrongpassword');
    fireEvent.press(getByTestId('login-submit'));

    await findByText(/incorrect email or password/i);
  });

  it('shows a rate-limit message with a Retry-After countdown on 429', async () => {
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'Too many requests', 429, { retryAfter: 30 }));
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId, findByText } = await render(<LoginForm />);
    fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('login-password'), 'password123456');
    fireEvent.press(getByTestId('login-submit'));

    await findByText(/try again in 30s/i);
  });

  it('navigates to the vault on success', async () => {
    const unlockSpy = jest.spyOn(useVaultStore.getState(), 'unlockWithPassword').mockResolvedValue(undefined);
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId } = await render(<LoginForm />);
    fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('login-password'), 'password123456');
    fireEvent.press(getByTestId('login-submit'));

    await waitFor(() => expect(unlockSpy).toHaveBeenCalledWith('user@example.com', 'password123456'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('guards against duplicate submissions while a request is in flight', async () => {
    let resolveUnlock: () => void = () => {};
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockImplementation(() => new Promise<void>((resolve) => { resolveUnlock = resolve; }));
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId } = await render(<LoginForm />);
    fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('login-password'), 'password123456');

    fireEvent.press(getByTestId('login-submit'));
    fireEvent.press(getByTestId('login-submit'));

    resolveUnlock();
    await waitFor(() => expect(unlockSpy).toHaveBeenCalledTimes(1));
  });
});
