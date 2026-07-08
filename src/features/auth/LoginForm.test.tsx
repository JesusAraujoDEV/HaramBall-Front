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
    await fireEvent.changeText(getByTestId('login-email'), 'not-an-email');
    await fireEvent.changeText(getByTestId('login-password'), 'anything');
    await fireEvent.press(getByTestId('login-submit'));

    await findByText(/valid email/i);
  });

  it('shows a generic message on 401 without revealing whether the email exists', async () => {
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 'Invalid credentials', 401));
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId, findByText } = await render(<LoginForm />);
    await fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password'), 'wrongpassword');
    await fireEvent.press(getByTestId('login-submit'));

    await findByText(/incorrect email or password/i);
  });

  it('prompts for the authenticator code on TOTP_REQUIRED, then logs in with it', async () => {
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockRejectedValueOnce(new ApiError('TOTP_REQUIRED', 'Authentication code required', 401))
      .mockResolvedValueOnce(undefined);
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId, findByTestId, findByText } = await render(<LoginForm />);
    await fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password'), 'password123456');
    await fireEvent.press(getByTestId('login-submit'));

    // First submit surfaces the code field.
    const codeInput = await findByTestId('login-totp');
    await findByText(/authenticator app/i);

    // Second submit includes the code and completes login.
    await fireEvent.changeText(codeInput, '123456');
    await fireEvent.press(getByTestId('login-submit'));

    await waitFor(() =>
      expect(unlockSpy).toHaveBeenLastCalledWith('user@example.com', 'password123456', {
        enableBiometrics: true,
        totpCode: '123456',
      }),
    );
  });

  it('shows a rate-limit message with a Retry-After countdown on 429', async () => {
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'Too many requests', 429, { retryAfter: 30 }));
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId, findByText } = await render(<LoginForm />);
    await fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password'), 'password123456');
    await fireEvent.press(getByTestId('login-submit'));

    await findByText(/try again in 30s/i);
  });

  it('unlocks the vault on success (navigation is handled by the auth gate)', async () => {
    const unlockSpy = jest.spyOn(useVaultStore.getState(), 'unlockWithPassword').mockResolvedValue(undefined);
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId } = await render(<LoginForm />);
    await fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password'), 'password123456');
    await fireEvent.press(getByTestId('login-submit'));

    await waitFor(() =>
      expect(unlockSpy).toHaveBeenCalledWith('user@example.com', 'password123456', {
        enableBiometrics: true,
      }),
    );
    // The form no longer navigates itself (that caused a double-replace hang);
    // the status-driven gate in the root layout routes to the vault.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('guards against duplicate submissions while a request is in flight', async () => {
    let resolveUnlock: () => void = () => {};
    const unlockSpy = jest
      .spyOn(useVaultStore.getState(), 'unlockWithPassword')
      .mockImplementation(() => new Promise<void>((resolve) => { resolveUnlock = resolve; }));
    useVaultStore.setState({ unlockWithPassword: unlockSpy as unknown as VaultState['unlockWithPassword'] });

    const { getByTestId } = await render(<LoginForm />);
    await fireEvent.changeText(getByTestId('login-email'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password'), 'password123456');

    // Fire both presses without awaiting individually: the first press's
    // handler never resolves until `resolveUnlock()` below, so awaiting it
    // here would deadlock the test (see the equivalent RegisterForm test).
    void fireEvent.press(getByTestId('login-submit'));
    void fireEvent.press(getByTestId('login-submit'));

    resolveUnlock();
    await waitFor(() => expect(unlockSpy).toHaveBeenCalledTimes(1));
  });
});
