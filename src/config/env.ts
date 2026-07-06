import { z } from 'zod';

/**
 * Environment configuration schema. Values come from `EXPO_PUBLIC_*` vars,
 * which Expo inlines at build time. Validated eagerly so a misconfigured
 * environment fails fast with a descriptive error rather than failing
 * mysteriously deep in the app (Requirements 14.1, 15.5).
 */
const requiredString = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .min(1, `${label} is required`);

const envSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: requiredString('EXPO_PUBLIC_API_BASE_URL').pipe(
    z.url('EXPO_PUBLIC_API_BASE_URL must be a valid URL'),
  ),
  EXPO_PUBLIC_LOCK_TIMEOUT_MS: requiredString('EXPO_PUBLIC_LOCK_TIMEOUT_MS')
    .regex(/^\d+$/, 'EXPO_PUBLIC_LOCK_TIMEOUT_MS must be an integer number of milliseconds')
    .transform(Number),
  EXPO_PUBLIC_CLIPBOARD_CLEAR_MS: requiredString('EXPO_PUBLIC_CLIPBOARD_CLEAR_MS')
    .regex(/^\d+$/, 'EXPO_PUBLIC_CLIPBOARD_CLEAR_MS must be an integer number of milliseconds')
    .transform(Number),
  EXPO_PUBLIC_ARGON2_PROFILE: requiredString('EXPO_PUBLIC_ARGON2_PROFILE'),
});

export interface Env {
  apiBaseUrl: string;
  lockTimeoutMs: number;
  clipboardClearMs: number;
  argon2Profile: string;
}

/**
 * Validates a raw environment record and returns a typed `Env`. Exported
 * (rather than only the singleton below) so it is independently unit
 * testable without relying on `process.env` mutation.
 */
export function validateEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue?.path?.join('.');
    const detail = firstIssue?.message ?? 'invalid value';
    const message = field ? `${field}: ${detail}` : detail;
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  const parsed = result.data;
  return {
    apiBaseUrl: parsed.EXPO_PUBLIC_API_BASE_URL,
    lockTimeoutMs: parsed.EXPO_PUBLIC_LOCK_TIMEOUT_MS,
    clipboardClearMs: parsed.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS,
    argon2Profile: parsed.EXPO_PUBLIC_ARGON2_PROFILE,
  };
}

let cachedEnv: Env | undefined;

/**
 * Builds the raw env record from individual `process.env.EXPO_PUBLIC_*`
 * accesses so that Metro/Babel can inline each one at compile time.
 * Accessing `process.env` as a whole object does NOT get inlined by Expo's
 * build pipeline, which causes `process` to be undefined in web at runtime.
 */
function getRawEnv(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_LOCK_TIMEOUT_MS: process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS,
    EXPO_PUBLIC_CLIPBOARD_CLEAR_MS: process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS,
    EXPO_PUBLIC_ARGON2_PROFILE: process.env.EXPO_PUBLIC_ARGON2_PROFILE,
  };
}

/**
 * Lazily validated singleton over `process.env`. Deferred (rather than
 * validated at module load) so importing this module in a test file does
 * not require a populated environment; the app's root layout calls
 * `getEnv()` on startup so misconfiguration still fails fast for real runs.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(getRawEnv());
  }
  return cachedEnv;
}
