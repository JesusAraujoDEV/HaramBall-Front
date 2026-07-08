import { request } from './client';
import {
  loginResponseSchema,
  logoutResponseSchema,
  recoverResponseSchema,
  refreshResponseSchema,
  registerResponseSchema,
  type LoginResponse,
  type LogoutResponse,
  type RecoverResponse,
  type RefreshResponse,
  type RegisterResponse,
} from './schemas';

/** Recovery Kit envelopes generated client-side (opaque to the server). */
export interface RecoveryKitPayload {
  wrappedVkPw: string;
  wrappedVkRk: string;
  recoveryAuthHash: string;
}

/**
 * Auth endpoints. `password` fields below always carry the client-derived
 * `Auth_Hash`, never the Master_Password (Requirements 1.2, 1.3, 2.1).
 */

export function register(
  email: string,
  authHash: string,
  kit?: RecoveryKitPayload,
): Promise<RegisterResponse> {
  return request({
    method: 'POST',
    path: '/auth/register',
    body: { email, password: authHash, ...kit },
    auth: false,
    schema: registerResponseSchema,
  });
}

export function recover(email: string, recoveryAuthHash: string): Promise<RecoverResponse> {
  return request({
    method: 'POST',
    path: '/auth/recover',
    body: { email, recoveryAuthHash },
    auth: false,
    schema: recoverResponseSchema,
  });
}

export function setPassword(authHash: string, wrappedVkPw: string): Promise<void> {
  return request({ method: 'POST', path: '/auth/password', body: { password: authHash, wrappedVkPw } });
}

export function setRecoveryKit(recoveryAuthHash: string, wrappedVkRk: string): Promise<void> {
  return request({ method: 'POST', path: '/auth/recovery-kit', body: { recoveryAuthHash, wrappedVkRk } });
}

export function login(email: string, authHash: string, totpCode?: string): Promise<LoginResponse> {
  return request({
    method: 'POST',
    path: '/auth/login',
    body: { email, password: authHash, ...(totpCode ? { totpCode } : {}) },
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
