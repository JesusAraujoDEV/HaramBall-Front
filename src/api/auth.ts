import { request } from './client';
import {
  loginResponseSchema,
  logoutResponseSchema,
  refreshResponseSchema,
  registerResponseSchema,
  type LoginResponse,
  type LogoutResponse,
  type RefreshResponse,
  type RegisterResponse,
} from './schemas';

/**
 * Auth endpoints. `password` fields below always carry the client-derived
 * `Auth_Hash`, never the Master_Password (Requirements 1.2, 1.3, 2.1).
 */

export function register(email: string, authHash: string): Promise<RegisterResponse> {
  return request({
    method: 'POST',
    path: '/auth/register',
    body: { email, password: authHash },
    auth: false,
    schema: registerResponseSchema,
  });
}

export function login(email: string, authHash: string): Promise<LoginResponse> {
  return request({
    method: 'POST',
    path: '/auth/login',
    body: { email, password: authHash },
    auth: false,
    schema: loginResponseSchema,
  });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return request({
    method: 'POST',
    path: '/auth/refresh',
    body: { refreshToken },
    auth: false,
    schema: refreshResponseSchema,
  });
}

export function logout(refreshToken: string): Promise<LogoutResponse> {
  return request({
    method: 'POST',
    path: '/auth/logout',
    body: { refreshToken },
    auth: false,
    schema: logoutResponseSchema,
  });
}
