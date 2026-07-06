import { z } from 'zod';

process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOCK_TIMEOUT_MS = '60000';
process.env.EXPO_PUBLIC_CLIPBOARD_CLEAR_MS = '20000';
process.env.EXPO_PUBLIC_ARGON2_PROFILE = 'interactive';

import { request } from './client';
import { ApiError, SessionExpiredError } from './errors';
import { tokenStore } from './tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('api/client request()', () => {
  beforeEach(() => {
    tokenStore.setTokens(null);
    jest.restoreAllMocks();
  });

  it('composes base URL + /api/v1 prefix + path', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
    await request({ method: 'GET', path: '/entries', auth: false });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/entries',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('attaches Authorization header when auth is true and a token is present', async () => {
    tokenStore.setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
    await request({ method: 'GET', path: '/entries' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer access-1' });
  });

  it('validates the response against the provided schema', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, { id: '123' }));
    const schema = z.object({ id: z.string() });
    const result = await request({ method: 'GET', path: '/x', auth: false, schema });
    expect(result).toEqual({ id: '123' });
  });

  it('maps a non-2xx response to a typed ApiError using the error envelope', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(409, { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email already registered' } }),
    );
    await expect(request({ method: 'POST', path: '/auth/register', auth: false })).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS',
      status: 409,
    });
  });

  it('on 401 with a refresh token, refreshes once and retries the original request', async () => {
    tokenStore.setTokens({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-access', expiresIn: 900 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: '1' }));

    const result = await request({ method: 'GET', path: '/entries/1' });

    expect(result).toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // retried request carries the new access token
    const retryInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(retryInit.headers).toMatchObject({ Authorization: 'Bearer new-access' });
    expect(tokenStore.getTokens()?.accessToken).toBe('new-access');
  });

  it('concurrent 401s trigger only a single refresh call (single-flight)', async () => {
    tokenStore.setTokens({ accessToken: 'expired', refreshToken: 'refresh-1' });
    let refreshCalls = 0;

    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        refreshCalls += 1;
        // Simulate network latency so both requests' 401s land before the
        // refresh resolves, forcing them to share the in-flight promise.
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse(200, { accessToken: 'new-access', expiresIn: 900 });
      }
      const headers = (init as RequestInit)?.headers as Record<string, string> | undefined;
      if (headers?.Authorization === 'Bearer new-access') {
        return jsonResponse(200, { id: u.includes('/entries/1') ? '1' : '2' });
      }
      return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } });
    });

    const [a, b] = await Promise.all([
      request<{ id: string }>({ method: 'GET', path: '/entries/1' }),
      request<{ id: string }>({ method: 'GET', path: '/entries/2' }),
    ]);

    expect(a.id).toBe('1');
    expect(b.id).toBe('2');
    expect(refreshCalls).toBe(1);
  });

  it('on refresh failure, clears tokens and throws SessionExpiredError', async () => {
    tokenStore.setTokens({ accessToken: 'expired', refreshToken: 'refresh-1' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'bad refresh' } }));

    await expect(request({ method: 'GET', path: '/entries/1' })).rejects.toBeInstanceOf(SessionExpiredError);
    expect(tokenStore.getTokens()).toBeNull();
  });

  it('with no refresh token available, a 401 immediately raises SessionExpiredError', async () => {
    tokenStore.setTokens(null);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }));

    await expect(request({ method: 'GET', path: '/entries/1' })).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('propagates ApiError for non-401 error statuses without attempting refresh', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    );
    await expect(request({ method: 'GET', path: '/entries', auth: false })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
