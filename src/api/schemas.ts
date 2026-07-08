import { z } from 'zod';

/**
 * Zod schemas mirroring the confirmed `HaramBall-Back` response shapes
 * (`src/entries/entries.service.ts` `EntryResponse`, `src/auth/auth.service.ts`
 * `LoginResult`/`RefreshResult`/`RegisterResult`, and
 * `src/common/errors/app-error.ts` `ErrorEnvelope`), re-checked against
 * `HaramBall-Back/src` on 2026-07-06 (Task 6.1).
 */

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const registerResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const logoutResponseSchema = z.object({
  success: z.literal(true),
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

/** Matches backend `EntryResponse` (`src/entries/entries.service.ts`). */
export const entryResponseSchema = z.object({
  id: z.string(),
  titleCiphertext: z.string(),
  bodyCiphertext: z.string().nullable(),
  tagsCiphertext: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EntryResponse = z.infer<typeof entryResponseSchema>;

export const createEntryResponseSchema = z.object({ id: z.string() });
export type CreateEntryResponse = z.infer<typeof createEntryResponseSchema>;

export const entryListResponseSchema = z.array(entryResponseSchema);

/** Matches backend `EntryBodyVersionResponse` (`src/entries/entries.service.ts`). */
export const entryBodyVersionSchema = z.object({
  id: z.string(),
  bodyCiphertext: z.string(),
  changedAt: z.string(),
});
export type EntryBodyVersion = z.infer<typeof entryBodyVersionSchema>;

export const entryHistoryResponseSchema = z.array(entryBodyVersionSchema);

export const searchResponseSchema = z.object({
  entries: z.array(entryResponseSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
