import { ApiError, NetworkError, SessionExpiredError } from '../api/errors';
import { DecryptionError } from '../crypto/errors';

/**
 * Central mapping from `ApiError`/`DecryptionError`/network errors to a
 * human-readable, non-technical message, per the design's Error Handling
 * table (Requirements 14.2, 14.3, 14.4, 14.5). Never surfaces raw stack
 * traces or internal details.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof SessionExpiredError) {
    return 'Your session has expired. Please log in again.';
  }

  if (error instanceof DecryptionError) {
    return 'This entry could not be decrypted. It may have been created with a different account.';
  }

  if (error instanceof NetworkError) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message || 'Some fields were invalid. Please review and try again.';
      case 401:
        return 'Incorrect email or password.';
      case 404:
        return 'This entry no longer exists.';
      case 409:
        return 'This email is already registered.';
      case 413:
        return 'This entry is too large to save.';
      case 429:
        return 'Too many attempts. Please wait before trying again.';
      case 500:
      default:
        return 'Something went wrong on our end. Please try again.';
    }
  }

  return 'Something went wrong. Please try again.';
}

/**
 * Extracts a `Retry-After`-style wait time (seconds) from a 429 `ApiError`,
 * if the backend included one in `details`. Returns `undefined` when not
 * present (Requirement 2.4).
 */
export function getRetryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.status !== 429) {
    return undefined;
  }
  const details = error.details as { retryAfter?: unknown } | undefined;
  const value = details?.retryAfter;
  return typeof value === 'number' ? value : undefined;
}
