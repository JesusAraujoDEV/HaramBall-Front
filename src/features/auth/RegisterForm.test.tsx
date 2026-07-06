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

jest.mock('../../services/AuthService');

import { AuthService } from '../../services/AuthService';
import { ApiError } from '../../api/errors';
import { RegisterForm } from './RegisterForm';

describe('RegisterForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks submission and shows a message for a short password', async () => {
    const { getByTestId, findByText } = await render(<RegisterForm />);
    fireEvent.changeText(getByTestId('register-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('register-password'), 'short');
    fireEvent.changeText(getByTestId('register-confirm-password'), 'short');
    fireEvent.press(getByTestId('register-submit'));

    await findByText(/at least 12 characters/i);
    expect(AuthService.register).not.toHaveBeenCalled();
  });

  it('blocks submission and shows a message for mismatched confirmation', async () => {
    const { getByTestId, findByText } = await render(<RegisterForm />);
    fireEvent.changeText(getByTestId('register-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('register-password'), 'correcthorsebattery');
    fireEvent.changeText(getByTestId('register-confirm-password'), 'different-password');
    fireEvent.press(getByTestId('register-submit'));

    await findByText(/do not match/i);
    expect(AuthService.register).not.toHaveBeenCalled();
  });

  it('blocks submission and shows a message for an invalid email', async () => {
    const { getByTestId, findByText } = await render(<RegisterForm />);
    fireEvent.changeText(getByTestId('register-email'), 'not-an-email');
    fireEvent.changeText(getByTestId('register-password'), 'correcthorsebattery');
    fireEvent.changeText(getByTestId('register-confirm-password'), 'correcthorsebattery');
    fireEvent.press(getByTestId('register-submit'));

    await findByText(/valid email/i);
    expect(AuthService.register).not.toHaveBeenCalled();
  });

  it('submits and navigates to login on success', async () => {
    (AuthService.register as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = await render(<RegisterForm />);
    fireEvent.changeText(getByTestId('register-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('register-password'), 'correcthorsebattery');
    fireEvent.changeText(getByTestId('register-confirm-password'), 'correcthorsebattery');
    fireEvent.press(getByTestId('register-submit'));

    await waitFor(() => expect(AuthService.register).toHaveBeenCalledWith('user@example.com', 'correcthorsebattery'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('shows an email-already-in-use message on 409', async () => {
    (AuthService.register as jest.Mock).mockRejectedValue(
      new ApiError('EMAIL_ALREADY_EXISTS', 'Email already registered', 409),
    );
    const { getByTestId, findByText } = await render(<RegisterForm />);
    fireEvent.changeText(getByTestId('register-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('register-password'), 'correcthorsebattery');
    fireEvent.changeText(getByTestId('register-confirm-password'), 'correcthorsebattery');
    fireEvent.press(getByTestId('register-submit'));

    await findByText(/already registered/i);
  });

  it('guards against duplicate submissions while a request is in flight', async () => {
    let resolveRegister: () => void = () => {};
    (AuthService.register as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => { resolveRegister = resolve; }),
    );
    const { getByTestId } = await render(<RegisterForm />);
    fireEvent.changeText(getByTestId('register-email'), 'user@example.com');
    fireEvent.changeText(getByTestId('register-password'), 'correcthorsebattery');
    fireEvent.changeText(getByTestId('register-confirm-password'), 'correcthorsebattery');

    fireEvent.press(getByTestId('register-submit'));
    fireEvent.press(getByTestId('register-submit'));
    fireEvent.press(getByTestId('register-submit'));

    resolveRegister();
    await waitFor(() => expect(AuthService.register).toHaveBeenCalledTimes(1));
  });
});
