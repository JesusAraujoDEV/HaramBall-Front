import { validateEnv } from './env';

const VALID_ENV = {
  EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
  EXPO_PUBLIC_LOCK_TIMEOUT_MS: '60000',
  EXPO_PUBLIC_CLIPBOARD_CLEAR_MS: '20000',
  EXPO_PUBLIC_ARGON2_PROFILE: 'interactive',
};

describe('validateEnv', () => {
  it('validates a fully-populated environment successfully', () => {
    const env = validateEnv(VALID_ENV);
    expect(env).toEqual({
      apiBaseUrl: 'http://localhost:3000',
      lockTimeoutMs: 60000,
      clipboardClearMs: 20000,
      argon2Profile: 'interactive',
    });
  });

  it('throws a descriptive error when EXPO_PUBLIC_API_BASE_URL is missing', () => {
    const { EXPO_PUBLIC_API_BASE_URL, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
  });

  it('throws a descriptive error when EXPO_PUBLIC_LOCK_TIMEOUT_MS is missing', () => {
    const { EXPO_PUBLIC_LOCK_TIMEOUT_MS, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(/EXPO_PUBLIC_LOCK_TIMEOUT_MS/);
  });

  it('throws a descriptive error when EXPO_PUBLIC_CLIPBOARD_CLEAR_MS is missing', () => {
    const { EXPO_PUBLIC_CLIPBOARD_CLEAR_MS, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(/EXPO_PUBLIC_CLIPBOARD_CLEAR_MS/);
  });

  it('throws a descriptive error when EXPO_PUBLIC_ARGON2_PROFILE is missing', () => {
    const { EXPO_PUBLIC_ARGON2_PROFILE, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(/EXPO_PUBLIC_ARGON2_PROFILE/);
  });

  it('throws when EXPO_PUBLIC_API_BASE_URL is not a valid URL', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, EXPO_PUBLIC_API_BASE_URL: 'not-a-url' }),
    ).toThrow(/valid URL/);
  });

  it('throws when a numeric var is not an integer', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, EXPO_PUBLIC_LOCK_TIMEOUT_MS: 'abc' }),
    ).toThrow(/EXPO_PUBLIC_LOCK_TIMEOUT_MS/);
  });
});
