/**
 * Typed error surfaced by the API client. Wraps the backend's stable error
 * `code` (see `HaramBall-Back/src/common/errors/app-error.ts` `ErrorCode`)
 * plus the HTTP status, so UI code can branch without parsing messages
 * (Requirements 14.2, 14.3, 14.4, 14.5).
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Raised when a request fails before reaching the server (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Raised by the refresh interceptor when the Refresh_Token is missing,
 * invalid, or expired and the caller must route to `/login`
 * (Requirements 3.1, 3.2).
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Session expired; please log in again') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}
