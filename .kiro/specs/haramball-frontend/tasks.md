# Implementation Plan: HaramBall Frontend

## Overview

This plan converts the HaramBall frontend design into incremental coding tasks for a React Native + Expo (Expo Router, TypeScript) implementation. Tasks build bottom-up: project scaffolding first, then the pure crypto module (contract-critical and highest test priority), then platform adapters, then the API client, then domain services, then the Zustand vault/session store and autolock, then UI screens, and finally cross-cutting error handling and end-to-end integration. Each step ends by integrating into the running app so no code is left orphaned.

Property-based/unit tests are included for the 13 correctness properties in the design (encryption round-trip, tamper-evidence, wrong-key safety, blind-index determinism, normalization equivalence, prefix coverage, key isolation, no secret egress, no secret at rest on web, no secret in logs, lock clears secrets, locked implies no plaintext, ownership scoping). Test sub-tasks are marked optional with `*` and can be skipped for a faster MVP, except the crypto correctness tests which are the highest-priority guarantee in this design and should not be skipped.

Because `HaramBall-Back` is being implemented in parallel, exact endpoint paths, request/response field names, and search semantics are an explicit integration checkpoint (see design "Open Integration Points"). The API client and SearchService isolate these assumptions so confirming them against the real backend does not ripple through the UI. Task 6.1 explicitly re-confirms the contract against `HaramBall-Back/src` before the API client is finalized.

## Tasks

- [x] 1. Scaffold Expo project, tooling, and configuration
  - [x] 1.1 Initialize Expo + Expo Router project with TypeScript
    - Create the app with the Expo TypeScript template and Expo Router enabled (`app/` directory, `app.json`, `babel.config.js`, `tsconfig.json` with strict mode)
    - Add `package.json` scripts for `start`, `android`, `ios`, `web`, `test`, `typecheck`, `lint`
    - Create `.gitignore` listing `.env`, `node_modules`, build output
    - _Requirements: 13.1, 13.2_

  - [x] 1.2 Install core dependencies from the Technology Stack table
    - Add `libsodium-wrappers` (+ `@types/libsodium-wrappers`) for web and `react-native-libsodium` for native, `expo-secure-store`, `expo-local-authentication`, `expo-clipboard`, `@tanstack/react-query`, `zustand`, `nativewind` (+ `tailwindcss`), `react-native-reanimated`, `zod`
    - Add dev dependencies: `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`, `fast-check` (for property tests)
    - _Requirements: 13.1_

  - [x] 1.3 Configure NativeWind, Reanimated, and Jest
    - Wire `tailwind.config.js`, `nativewind` babel/metro config, Reanimated babel plugin
    - Configure `jest.config.js` (preset `jest-expo`) and a `jest.setup.ts` for RNTL matchers
    - _Requirements: 13.1, 13.2_

  - [x] 1.4 Implement environment config module
    - Create `src/config/env.ts` reading `EXPO_PUBLIC_*` vars, validated with Zod at startup; missing required vars fail fast with a descriptive error
    - Create `.env.example` documenting `EXPO_PUBLIC_API_BASE_URL`, lock timeout, clipboard clear timeout, Argon2 profile
    - _Requirements: 14.1, 15.5_

  - [x]* 1.5 Write unit tests for env validation
    - Test that missing required variables throw a descriptive startup error
    - Test that a fully-populated environment validates successfully
    - _Requirements: 14.1_

- [x] 2. Checkpoint - Ensure scaffold builds
  - Ensure `npx tsc --noEmit`, `npm test`, and `npx expo start --web` (or equivalent build check) succeed on the empty scaffold. Ask the user if questions arise.

- [x] 3. Implement crypto module (contract-critical, highest test priority)
  - [x] 3.1 Implement sodium init singleton
    - Create `src/crypto/sodium.ts` exposing an awaited `ready` singleton over `libsodium-wrappers` (web) / `react-native-libsodium` (native) via platform file resolution
    - _Requirements: 5.1, 5.2_

  - [x] 3.2 Implement normalize module
    - Create `src/crypto/normalize.ts`: `normalize(s)` = trim + lowercase + strip diacritics
    - _Requirements: 10.1, 10.3_

  - [x]* 3.3 Write property tests for normalization equivalence (Property 5)
    - **Property: Normalization Equivalence — inputs differing only by case, surrounding whitespace, or diacritics produce the same normalized value**
    - **Validates: Requirements 10.1, 10.3**

  - [x] 3.4 Implement KDF module
    - Create `src/crypto/kdf.ts`: `deriveMasterKey(masterPassword, email)` using Argon2id with salt = `blake2b(normalize(email), len=16)`, pinned Argon2 opslimit/memlimit constants
    - `deriveSubkeys(masterKey)` using `crypto_kdf_derive_from_key` with domain-separated 8-byte contexts (`hb-enc__` subkey 1, `hb-idx__` subkey 2, `hb-auth_` subkey 3) returning `{ encryptionKey, indexKey, authHash }`
    - Centralize Argon2 params, contexts, `MIN_PREFIX`, `PAD_BUCKET`, envelope version as pinned constants in `src/crypto/constants.ts`
    - _Requirements: 5.1, 5.2, 1.1, 1.2, 2.1_

  - [x]* 3.5 Write unit + property tests for KDF (Property 7: key isolation)
    - **Property: Key Isolation — encryptionKey, indexKey, and authHash are pairwise distinct and domain-separated**
    - **Validates: Requirements 5.2, 1.2**
    - Known-answer vector test: same password + email always derive the same keys (determinism across runs)
    - _Requirements: 5.1, 5.2_

  - [x] 3.6 Implement cipher module
    - Create `src/crypto/errors.ts` with typed `DecryptionError`
    - Create `src/crypto/cipher.ts`: `encrypt(plaintext, encKey)` using random 24-byte XChaCha20-Poly1305 nonce, envelope `v1.<base64(nonce||ct)>`; `decrypt(envelope, encKey)` parsing/validating the version prefix and throwing `DecryptionError` on auth failure or malformed envelope
    - _Requirements: 5.3, 5.4_

  - [x]* 3.7 Write property tests for cipher (Properties 1, 2, 3)
    - **Property 1: Encryption round-trip — `decrypt(encrypt(m, k), k) === m` for any string and key**
    - **Property 2: Tamper-evidence — modifying any byte of an envelope causes `decrypt` to throw, never returns wrong plaintext**
    - **Property 3: Wrong-key safety — `decrypt(envelope, k2)` with `k2 ≠ k` always throws**
    - **Validates: Requirements 5.3, 5.4**

  - [x] 3.8 Implement blind index module
    - Create `src/crypto/blindIndex.ts`: `blindIndex(value, indexKey)` = base64 keyed BLAKE2b (`crypto_generichash`, out=16) of `normalize(value)`
    - `buildTitlePrefixIndex(title, indexKey)`: tokenize normalized title, generate all prefixes `≥ MIN_PREFIX` per token, dedupe into a set, pad to a multiple of `PAD_BUCKET` with random 16-byte indexes
    - _Requirements: 10.1, 10.3, 11.1_

  - [x]* 3.9 Write property tests for blind index (Properties 4, 6)
    - **Property 4: Blind-index determinism — stable across runs/platforms for the same normalized value and key**
    - **Property 6: Prefix coverage — for title token `t` and any prefix `p` with `len(p) ≥ MIN_PREFIX`, `blindIndex(p, k)` is a member of `buildTitlePrefixIndex(title, k)`**
    - **Validates: Requirements 10.1, 10.2, 10.3, 11.1, 6.3, 8.1**

  - [x] 3.10 Write known-answer contract vectors
    - Fix a test vector (fixed password/email/title/tag) and assert exact expected base64 outputs to lock the KDF/cipher/blind-index contract against accidental changes
    - _Requirements: 5.1, 5.2, 10.1_

- [x] 4. Checkpoint - Ensure crypto module passes all tests
  - Ensure `npm test src/crypto` passes fully including property tests, and `npx tsc --noEmit` is clean. Ask the user if questions arise.

- [x] 5. Implement platform adapters
  - [x] 5.1 Implement SecureStoreAdapter (native/web)
    - Create `src/platform/secureStore.native.ts` wrapping `expo-secure-store` (`save`/`read`/`remove`/`isAvailable`)
    - Create `src/platform/secureStore.web.ts` as a no-op/throwing implementation so no key material is ever persisted on web
    - _Requirements: 4.1, 4.4, 15.4_

  - [x] 5.2 Implement BiometricAdapter (native/web)
    - Create `src/platform/biometric.native.ts` wrapping `expo-local-authentication` (`isAvailable`/`authenticate`)
    - Create `src/platform/biometric.web.ts` returning `isAvailable() = false` always
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.3 Implement ClipboardAdapter
    - Create `src/platform/clipboard.ts` wrapping `expo-clipboard` `copy`, plus `scheduleClear(value, timeoutMs)` that re-checks clipboard contents before clearing (best-effort, platform-guarded)
    - _Requirements: 12.1, 12.4, 12.5_

  - [x]* 5.4 Write unit tests for platform adapters (Property 9)
    - **Property 9: No secret at rest on Web — web SecureStoreAdapter never writes to localStorage/sessionStorage/IndexedDB/cookies**
    - **Validates: Requirements 4.4, 15.4**
    - Mock native modules; verify web adapters no-op/throw and native adapters delegate correctly
    - _Requirements: 4.1, 4.2, 4.4_

- [x] 6. Implement API client
  - [x] 6.1 Confirm API contract against HaramBall-Back
    - Inspect `HaramBall-Back/src` (auth/entries/search controllers, DTOs, Prisma schema field names) for actual routes, field names (`titleCiphertext`/`bodyCiphertext`/`tagsCiphertext` per Prisma schema), status codes, and the `api/v1` global prefix
    - Update `src/api/schemas.ts` and endpoint paths to match reality; record any still-unconfirmed items as inline `// TODO(confirm-backend)` comments
    - _Requirements: 14.1_

  - [x] 6.2 Implement typed fetch wrapper and error envelope mapping
    - Create `src/api/client.ts`: `request<T>({ method, path, body, auth, schema })` attaching `Authorization: Bearer <accessToken>` when `auth: true`, parsing JSON, validating with an optional Zod schema, mapping HTTP status + backend error envelope (`{ code, message }`) to a typed `ApiError(code, message, status)`
    - Base URL from `src/config/env.ts`, prefixed with `/api/v1`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 6.3 Implement 401 refresh/retry-once interceptor
    - On 401 with a refresh token available, call refresh endpoint once (single-flight guard so concurrent 401s share one in-flight refresh), store the new access token, retry the original request exactly once
    - On refresh failure/no refresh token: clear session, lock vault, propagate a distinguishable error for routing to `/login`
    - _Requirements: 3.1, 3.2_

  - [x] 6.4 Implement auth/entries/search API modules and Zod schemas
    - Create `src/api/auth.ts` (`register`, `login`, `refresh`, `logout`), `src/api/entries.ts` (`list`, `get`, `create`, `update`, `remove`), `src/api/search.ts` (`byTitle`, `byTags`)
    - Create `src/api/schemas.ts` with Zod schemas for `EntryResponse`, `AuthTokens`, error envelope
    - _Requirements: 1.1, 1.2, 2.1, 6.3, 6.4, 7.1, 8.1, 9.2, 10.1, 11.1_

  - [x]* 6.5 Write API client unit tests
    - Test 401 → refresh → retry-once; concurrent 401s trigger a single refresh (single-flight); error envelope mapping to `ApiError`; base URL/prefix composition
    - _Requirements: 3.1, 3.2, 14.2, 14.3, 14.4_

  - [x]* 6.6 Write property test for no-secret-egress (Property 8)
    - **Property 8: No secret egress — no request body or query built by the API modules contains the Master_Password, Master_Key, Encryption_Key, Index_Key, or plaintext title/body/tag**
    - **Validates: Requirements 1.3, 2.1, 5.3**

- [x] 7. Checkpoint - Ensure API client passes tests
  - Ensure `npm test src/api` passes and `npx tsc --noEmit` is clean. Ask the user if questions arise.

- [x] 8. Implement domain services
  - [x] 8.1 Implement AuthService
    - Create `src/services/AuthService.ts`: `register(email, masterPassword)` derives keys and calls `api/auth.register` sending only `authHash`; `login(email, masterPassword)` derives keys, calls `api/auth.login`, returns `{ keys, tokens }`; `logout()` calls `api/auth.logout` then clears local state
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.3_

  - [x]* 8.2 Write unit tests for AuthService
    - Assert only `authHash` (never masterPassword/masterKey) is sent in the login/register request bodies (mocked API, real crypto)
    - _Requirements: 1.3, 2.1_

  - [x] 8.3 Implement EntryService
    - Create `src/services/EntryService.ts`: `list()`/`get(id)` fetch + decrypt; `create(title, body, tags)` encrypts title/body/tags, builds `titleIndex`/`tagIndexes`, posts, returns `PlainEntry`; `update(id, ...)` re-encrypts + rebuilds indexes; `remove(id)` deletes
    - Use `src/utils/entryText.ts` `parseEntryText`/serialize helpers for title/body split
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 8.1, 8.2, 8.4, 9.2_

  - [x]* 8.4 Write unit tests for EntryService
    - Assert create/update payload shape (title prefix index set membership, one blind index per tag) with mocked API + real crypto
    - Assert decryption failure on a listed entry surfaces a per-entry error without throwing for the whole list
    - _Requirements: 6.3, 7.3, 8.1_

  - [x] 8.5 Implement SearchService
    - Create `src/services/SearchService.ts`: `byTitle(query)` normalizes + computes blind index + calls `api/search.byTitle` + decrypts results; `byTags(tags)` computes one blind index per tag + calls `api/search.byTags` + decrypts results
    - _Requirements: 10.1, 10.2, 10.3, 11.1, 11.2_

  - [x]* 8.6 Write unit tests for SearchService
    - Assert query normalization + blind index computation before the API call; assert empty results produce an empty array (no throw)
    - _Requirements: 10.1, 10.5, 11.3_

  - [x] 8.7 Implement utils: entryText parsing and labeled-field detection
    - Create `src/utils/entryText.ts`: `parseEntryText(text)` (title = first line, body = rest), reverse `serializeEntryText`
    - `detectFields(body)`: label regex (clave/password/contraseña/usuario/user/ip/servidor/server/email/correo) and email-pattern detection, returning per-line copy candidates
    - _Requirements: 6.1, 8.4, 12.2_

  - [x]* 8.8 Write unit tests for entryText utils
    - Test title/body split edge cases (empty body, blank title), and labeled-field/email detection against representative entry bodies
    - _Requirements: 6.1, 6.2, 8.4, 12.2_

- [x] 9. Checkpoint - Ensure services pass tests
  - Ensure `npm test src/services src/utils` passes and `npx tsc --noEmit` is clean. Ask the user if questions arise.

- [x] 10. Implement Vault/Session store and autolock
  - [x] 10.1 Implement Zustand vault store
    - Create `src/vault/vaultStore.ts` with `VaultState` shape from the design: `status`, `keys`, `entries`, `tokens`, and actions `unlockWithPassword`, `unlockWithBiometrics`, `lock`, `logout`
    - `lock()` zeroes key buffers (overwrite `Uint8Array` contents) and clears the decrypted entry cache
    - `unlockWithPassword` orchestrates `AuthService.login` + optional biometric opt-in persistence via `SecureStoreAdapter`
    - _Requirements: 2.2, 3.5, 4.1, 4.5, 4.6, 5.5_

  - [x]* 10.2 Write unit tests for vault store (Property 11: lock clears secrets)
    - **Property 11: Lock clears secrets — after `lock()`, `keys === null` and the decrypted entry cache is empty**
    - **Validates: Requirements 5.5, 4.5, 15.2**
    - _Requirements: 5.5, 4.5_

  - [x] 10.3 Implement biometric unlock flow
    - `unlockWithBiometrics()`: `BiometricAdapter.authenticate()` → on success read `masterKey`/`refreshToken` from `SecureStoreAdapter` → `deriveSubkeys` → `api/auth.refresh` → set store to `unlocked`; on failure/cancel remain `locked` and allow master-password fallback
    - _Requirements: 4.2, 4.3_

  - [x] 10.4 Implement autolock
    - Create `src/vault/autolock.ts`: `AppState` listener (native) / `visibilitychange` listener (web) starting a configurable timeout on background/inactive; on timeout calls `vaultStore.lock()`
    - _Requirements: 4.5_

  - [x]* 10.5 Write unit tests for autolock timer
    - Test that backgrounding beyond the configured timeout triggers `lock()`, and that returning before timeout does not
    - _Requirements: 4.5_

- [x] 11. Checkpoint - Ensure vault store passes tests
  - Ensure `npm test src/vault` passes and `npx tsc --noEmit` is clean. Ask the user if questions arise.

- [x] 12. Implement root app shell and navigation
  - [x] 12.1 Implement root layout with providers and auth gate
    - Create `app/_layout.tsx`: wraps the tree in `QueryClientProvider`, initializes crypto (`sodium.ready`), subscribes to `vaultStore`, routes to `(auth)` when locked/no tokens and `(vault)` when unlocked
    - _Requirements: 3.5, 4.6_

  - [x] 12.2 Implement LockOverlay component
    - Create `src/ui/LockOverlay.tsx`: full-screen blur/cover shown when `status !== 'unlocked'` or on native `AppState` `inactive`/`background` (Reanimated fade)
    - _Requirements: 4.6, 15.3_

  - [x]* 12.3 Write component test for LockOverlay (Property 12: locked implies no plaintext)
    - **Property 12: Locked implies no plaintext — while `status !== 'unlocked'`, no decrypted entry content is present in any rendered component**
    - **Validates: Requirements 3.5, 4.6, 15.2**

  - [x] 12.4 Implement top-level error boundary
    - Create `src/ui/ErrorBoundary.tsx` catching render errors and showing a safe fallback without leaking state/stack traces
    - _Requirements: 14.3_

- [x] 13. Implement auth screens
  - [x] 13.1 Implement RegisterScreen
    - Create `app/(auth)/register.tsx` + `src/features/auth/RegisterForm.tsx`: email + masterPassword + confirmation fields, Zod validation (email format, password ≥ 12 chars, confirmation match), prominent "forgotten password = unrecoverable" warning, loading state guarding duplicate submission, 409 → "email already in use" message
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 13.2 Implement LoginScreen
    - Create `app/(auth)/login.tsx` + `src/features/auth/LoginForm.tsx`: email + masterPassword fields, loading state guarding duplicate submission, generic 401 message, 429 message with `Retry-After` countdown
    - _Requirements: 2.3, 2.4, 2.6_

  - [x]* 13.3 Write component tests for auth forms
    - Test validation blocking (short password, mismatched confirmation, invalid email), duplicate-submission guard, and error message rendering for 409/401/429
    - _Requirements: 1.4, 1.5, 1.6, 2.3, 2.4_

- [x] 14. Checkpoint - Ensure auth flow works end-to-end
  - Ensure register/login screens compile, tests pass, and the auth gate in `app/_layout.tsx` routes correctly on mock unlock/lock transitions. Ask the user if questions arise.

- [ ] 15. Implement vault list, search, and entry screens
  - [ ] 15.1 Implement SearchBar and chat-style vault list
    - Create `src/ui/SearchBar.tsx` (debounced 250ms input) and `app/(vault)/index.tsx` + `src/features/vault/VaultList.tsx`: fetch + decrypt entries via TanStack Query on unlock, render via `EntryCard`, empty-state message for no results, clearing search returns to full list
    - _Requirements: 7.1, 7.3, 7.5, 10.1, 10.2, 10.4, 10.5, 10.6_

  - [ ] 15.2 Implement EntryCard and tag filter UI
    - Create `src/ui/EntryCard.tsx` (decrypted title, expand affordance, body copy button) and tag-filter selector calling `SearchService.byTags`; empty-state for no tag matches; clearing filter restores full list
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.3_

  - [ ]* 15.3 Write component tests for search debounce and empty states
    - Test debounce reduces call count on rapid typing; empty-state rendering for title and tag search; per-entry decrypt-error state doesn't crash the list
    - _Requirements: 7.3, 10.4, 10.5, 11.3_

  - [ ] 15.4 Implement entry detail screen with FieldCopyRow
    - Create `app/(vault)/entry/[id].tsx` + `src/ui/FieldCopyRow.tsx`: decrypt + display title/body/tags/timestamps (localized), full-body copy action, per-line copy via `detectFields`, copy confirmation toast, clipboard auto-clear via `ClipboardAdapter.scheduleClear`
    - 404 handling: remove from cache + inform user
    - _Requirements: 7.2, 7.4, 7.5, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ] 15.5 Implement create/edit entry screens with TagInput
    - Create `app/(vault)/entry/new.tsx`, `app/(vault)/entry/[id]/edit.tsx`, `src/ui/TagInput.tsx`; free-form text editor (title = first line), blank-title validation, tag add/remove, 413 → "entry too large" message, optimistic vault update on success, 404-on-edit handling
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 15.6 Write component tests for entry create/edit/delete
    - Test blank-title blocks submission, tag add/remove, delete confirmation dialog gating, 413/404 error message rendering
    - _Requirements: 6.2, 6.6, 8.3, 9.1, 9.4_

- [ ] 16. Checkpoint - Ensure vault CRUD + search UI works end-to-end
  - Ensure all vault screens compile, tests pass, and manual create → search → edit → delete flow works against a running/mock backend. Ask the user if questions arise.

- [ ] 17. Implement cross-cutting hygiene and error handling
  - [ ] 17.1 Implement log scrubbing
    - Central logging helper excluding ciphertext, Master_Password, derived keys, and blind-index inputs from any `console.*`/crash-report output
    - _Requirements: 5.6, 15.1_

  - [ ]* 17.2 Write property test for no-secret-in-logs (Property 10)
    - **Property 10: No secret in logs — log/crash output excludes secrets, ciphertext, and blind-index inputs**
    - **Validates: Requirements 5.6, 15.1**

  - [ ] 17.3 Implement app-switcher privacy overlay (native)
    - Extend `LockOverlay`/root layout to render the blur/cover on `inactive`/`background` `AppState` before the OS takes its preview snapshot
    - _Requirements: 15.3_

  - [ ] 17.4 Wire global error → user-message mapping
    - Central mapping from `ApiError`/`DecryptionError`/network errors to the Error Handling table in the design (401 refresh/retry, 409, 413, 429 + `Retry-After`, 404, 500/network, 400 field errors)
    - _Requirements: 14.2, 14.3, 14.4, 14.5_

  - [ ]* 17.5 Write property test for ownership scoping (Property 13)
    - **Property 13: Ownership scoping — the UI only renders entries returned by the backend for the authenticated account; no client-side cross-account state**
    - **Validates: Requirements 7.1, 10.2, 11.2**

- [ ] 18. Final integration and end-to-end verification
  - [ ] 18.1 Wire full app: providers, gate, screens, error boundary
    - Confirm `app/_layout.tsx` composes `ErrorBoundary`, `QueryClientProvider`, `LockOverlay`, and route groups correctly on native and web builds
    - _Requirements: 13.1, 13.2, 13.4_

  - [ ]* 18.2 Write end-to-end test for the full user journey
    - Test register → login → create entry → list/search by title/tag → copy → edit → delete → logout → relock, against a mocked API layer, asserting no plaintext leaks while locked
    - _Requirements: 1.1, 2.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1, 15.2_

  - [ ] 18.3 Re-confirm Open Integration Points against final HaramBall-Back
    - Re-check exact endpoint paths/field names, search request shape (equality-match semantics on stored prefix sets), max entry size (413), 400 validation field structure, and whether refresh rotates the refresh token; update API client/SearchService/SecureStore persistence accordingly
    - _Requirements: 14.1, 14.5_

- [ ] 19. Final checkpoint - Ensure all tests pass
  - Ensure `npm test`, `npx tsc --noEmit`, and a manual smoke test on web (and native simulator if available) all pass end-to-end. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, **except** the crypto correctness tests in section 3, which are the highest-priority guarantee in this design and should not be skipped.
- Each task references specific requirements (granular sub-requirement clauses) for traceability.
- Checkpoints ensure incremental validation at natural boundaries.
- Property-based tests (recommend `fast-check`, mirroring the backend's convention) validate the 13 correctness properties from the design: encryption round-trip, tamper-evidence, wrong-key safety, blind-index determinism, normalization equivalence, prefix coverage, key isolation, no secret egress, no secret at rest on web, no secret in logs, lock clears secrets, locked implies no plaintext, ownership scoping.
- Task 6.1 and 18.3 are explicit checkpoints to re-align the API client with the real `HaramBall-Back` contract as that project completes in parallel; do not let unconfirmed guesses propagate into UI code — they are isolated in `src/api` and `src/services/SearchService.ts`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["1.5", "3.1"] },
    { "id": 4, "tasks": ["2", "3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4"] },
    { "id": 6, "tasks": ["3.5", "3.6"] },
    { "id": 7, "tasks": ["3.7", "3.8"] },
    { "id": 8, "tasks": ["3.9", "3.10", "5.1", "5.2", "5.3"] },
    { "id": 9, "tasks": ["4", "5.4"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2"] },
    { "id": 12, "tasks": ["6.3"] },
    { "id": 13, "tasks": ["6.4"] },
    { "id": 14, "tasks": ["6.5", "6.6"] },
    { "id": 15, "tasks": ["7", "8.1"] },
    { "id": 16, "tasks": ["8.2", "8.3", "8.5", "8.7"] },
    { "id": 17, "tasks": ["8.4", "8.6", "8.8"] },
    { "id": 18, "tasks": ["9", "10.1"] },
    { "id": 19, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 20, "tasks": ["10.5", "11"] },
    { "id": 21, "tasks": ["12.1"] },
    { "id": 22, "tasks": ["12.2", "12.4"] },
    { "id": 23, "tasks": ["12.3", "13.1", "13.2"] },
    { "id": 24, "tasks": ["13.3", "14"] },
    { "id": 25, "tasks": ["15.1", "15.2"] },
    { "id": 26, "tasks": ["15.3", "15.4", "15.5"] },
    { "id": 27, "tasks": ["15.6", "16"] },
    { "id": 28, "tasks": ["17.1", "17.3", "17.4"] },
    { "id": 29, "tasks": ["17.2", "17.5", "18.1"] },
    { "id": 30, "tasks": ["18.2", "18.3"] },
    { "id": 31, "tasks": ["19"] }
  ]
}
```
