import type { ZodType } from 'zod';
import { getEnv } from '../config/env';
import { ApiError, NetworkError, SessionExpiredError } from './errors';
import { errorEnvelopeSchema, refreshResponseSchema } from './schemas';
import { tokenStore } from './tokenStore';

const API_PREFIX = '/api/v1';

export interface RequestOptions<T> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Attach `Authorization: Bearer <accessToken>`. Defaults to true. */
  auth?: boolean;
  schema?: ZodType<T>;
}

function buildUrl(path: string): string {
  const base = getEnv().apiBaseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${API_PREFIX}${suffix}`;
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string; details?: unknown }> {
  try {
    const json = await response.json();
    const result = errorEnvelopeSchema.safeParse(json);
    if (result.success) {
      return result.data.error;
    }
  } catch {
    // fall through to generic message below
  }
  return { code: 'UNKNOWN_ERROR', message: 'Request failed' };
}

async function doFetch<T>(opts: RequestOptions<T>, accessToken: string | undefined): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    return await fetch(buildUrl(opts.path), {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }
}

// Single-flight refresh guard: concurrent 401s share one in-flight refresh call.
let inFlightRefresh: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const current = tokenStore.getTokens();
    if (!current?.refreshToken) {
      throw new SessionExpiredError();
    }

    let response: Response;
    try {
      response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
    } catch {
      throw new SessionExpiredError();
    }

    if (!response.ok) {
      throw new SessionExpiredError();
    }

    const json = await response.json();
    const parsed = refreshResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new SessionExpiredError();
    }

    tokenStore.setAccessToken(parsed.data.accessToken);
    return parsed.data.accessToken;
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

/**
 * Typed fetch wrapper. Attaches the Access_Token when `auth !== false`,
 * validates the response body with an optional Zod schema, maps HTTP
 * failures to a typed `ApiError`, and transparently performs a single
 * refresh + retry on a 401 (Requirements 14.1-14.5, 3.1, 3.2).
 */
export async function request<T>(opts: RequestOptions<T>): Promise<T> {
  const useAuth = opts.auth !== false;
  const current = tokenStore.getTokens();

  let response = await doFetch(opts, useAuth ? current?.accessToken : undefined);

  if (response.status === 401 && useAuth) {
    try {
      const newAccessToken = await refreshAccessToken();
      response = await doFetch(opts, newAccessToken);
    } catch (err) {
      tokenStore.setTokens(null);
      tokenStore.onSessionExpired();
      throw err instanceof SessionExpiredError ? err : new SessionExpiredError();
    }
  }

  if (!response.ok) {
    const { code, message, details } = await parseErrorBody(response);
    throw new ApiError(code, message, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json();
  if (opts.schema) {
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError('INVALID_RESPONSE', 'Received an unexpected response from the server', response.status);
    }
    return parsed.data;
  }
  return json as T;
}
