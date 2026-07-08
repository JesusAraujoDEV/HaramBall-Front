import { request } from './client';
import { z } from 'zod';

/** TOTP (authenticator) enrollment + management API. All routes are authed. */

const enrollSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrDataUrl: z.string(),
});
export type TotpEnroll = z.infer<typeof enrollSchema>;

const statusSchema = z.object({ enabled: z.boolean() });

export function enroll(): Promise<TotpEnroll> {
  return request({ method: 'POST', path: '/auth/totp/enroll', schema: enrollSchema });
}

export function verify(code: string): Promise<{ enabled: boolean }> {
  return request({
    method: 'POST',
    path: '/auth/totp/verify',
    body: { code },
    schema: z.object({ enabled: z.boolean() }),
  });
}

export function disable(code: string): Promise<{ enabled: boolean }> {
  return request({
    method: 'POST',
    path: '/auth/totp/disable',
    body: { code },
    schema: z.object({ enabled: z.boolean() }),
  });
}

export function status(): Promise<{ enabled: boolean }> {
  return request({ method: 'GET', path: '/auth/totp/status', schema: statusSchema });
}
