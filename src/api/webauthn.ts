import { request } from './client';
import { z } from 'zod';

/**
 * Passkey (WebAuthn) API calls. The options objects are passed through
 * opaquely to the browser's `navigator.credentials` API; only the top-level
 * verification results are schema-validated.
 */

const verifiedSchema = z.object({ verified: z.boolean() });
const verifiedAtSchema = z.object({ verified: z.boolean(), verifiedAt: z.string() });

export function registrationOptions(): Promise<Record<string, unknown>> {
  return request({ method: 'POST', path: '/webauthn/register/options' });
}

export function verifyRegistration(response: unknown): Promise<{ verified: boolean }> {
  return request({
    method: 'POST',
    path: '/webauthn/register/verify',
    body: { response },
    schema: verifiedSchema,
  });
}

export function authenticationOptions(): Promise<Record<string, unknown>> {
  return request({ method: 'POST', path: '/webauthn/authenticate/options' });
}

export function verifyAuthentication(response: unknown): Promise<{ verified: boolean; verifiedAt: string }> {
  return request({
    method: 'POST',
    path: '/webauthn/authenticate/verify',
    body: { response },
    schema: verifiedAtSchema,
  });
}
