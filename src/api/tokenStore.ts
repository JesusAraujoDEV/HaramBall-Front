/**
 * In-memory holder for the current auth tokens plus a session-expired
 * callback, injected by the Vault store. Kept separate from `client.ts` so
 * the client module has no direct dependency on `src/vault` (which itself
 * depends on the API client), avoiding a circular import.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  getTokens(): AuthTokens | null;
  setAccessToken(accessToken: string): void;
  setTokens(tokens: AuthTokens | null): void;
  /** Invoked when refresh fails/no refresh token is available; caller should lock + route to /login. */
  onSessionExpired(): void;
}

let tokens: AuthTokens | null = null;
let sessionExpiredHandler: (() => void) | undefined;

export const tokenStore: TokenStore = {
  getTokens(): AuthTokens | null {
    return tokens;
  },
  setAccessToken(accessToken: string): void {
    if (tokens) {
      tokens = { ...tokens, accessToken };
    }
  },
  setTokens(next: AuthTokens | null): void {
    tokens = next;
  },
  onSessionExpired(): void {
    sessionExpiredHandler?.();
  },
};

/** Registered by the Vault store so the client can trigger lock + routing on unrecoverable auth failure. */
export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}
