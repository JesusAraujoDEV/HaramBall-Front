# Design Document

## Overview

HaramBall-Front is a cross-platform (iOS / Android / Web) zero-knowledge password manager client built with **React Native + Expo** and **Expo Router**. It is the client side of the HaramBall system: it derives all cryptographic material from the user's Master Password, encrypts entry content before transmission, computes blind indexes for searchable encryption, and consumes the existing HaramBall REST API for persistence and search.

The defining design constraint is **zero-knowledge**: the server must never receive the Master Password, derived encryption keys, or plaintext content. Everything sensitive is encrypted/derived on-device. This pushes meaningful logic into well-isolated, unit-testable client layers (crypto, vault, API), keeping the UI thin.

### Design Goals

- **Single codebase** for native and web via Expo + Expo Router.
- **Crypto correctness first**: an isolated, deterministic, fully tested crypto module that matches the backend's blind-index contract exactly.
- **Keys live in memory only** while unlocked; on native they may be persisted in OS-backed secure storage behind biometrics; on web they are never written to disk.
- **Chat-style search** as the primary interaction, backed by prefix blind indexes.
- **Thin, declarative UI** with state managed by a session store (Zustand) and server cache (TanStack Query).

### Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React Native + Expo (dev build / prebuild) | Cross-platform, native module support for crypto/biometrics |
| Routing | Expo Router | File-based routing shared across web + native |
| Language | TypeScript (strict) | Safety for crypto/contract code |
| Crypto | libsodium (`libsodium-wrappers` web, `react-native-libsodium` native) | Argon2id, XChaCha20-Poly1305, keyed BLAKE2b in one portable API |
| Secure storage | `expo-secure-store` | Keychain / Keystore on native |
| Biometrics | `expo-local-authentication` | Fingerprint / Face ID |
| Clipboard | `expo-clipboard` | Copy actions + auto-clear |
| Server state | TanStack Query | Caching, retries, request dedupe |
| Client state | Zustand | Lightweight in-memory vault/session store |
| HTTP | `fetch` wrapped in a typed client | Token attach + refresh interceptor |
| Styling | NativeWind | Tailwind utility styling on RN + web |
| Animation | Reanimated | Smooth chat/card transitions, lock blur |
| Validation | Zod | Form + API response schema validation |
| Testing | Jest + React Native Testing Library | Unit + component tests |

## Architecture

### Layered Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         UI Layer (app/)                        │
│   Expo Router screens · feature components · NativeWind        │
└───────────────┬───────────────────────────────┬───────────────┘
                │                                 │
        ┌───────▼────────┐               ┌────────▼─────────┐
        │  Vault/Session │               │  TanStack Query  │
        │  Store (Zustand)│              │  hooks (entries, │
        │  keys in memory │              │  search, auth)   │
        └───────┬────────┘               └────────┬─────────┘
                │                                  │
        ┌───────▼──────────────────────────────────▼─────────┐
        │                  Domain Services                     │
        │  EntryService · SearchService · AuthService          │
        │  (orchestrate crypto + api, never hold UI concerns)  │
        └───────┬───────────────────────────────────┬─────────┘
                │                                     │
        ┌───────▼────────┐                   ┌────────▼─────────┐
        │  Crypto Module │                   │   API Client     │
        │ kdf · cipher · │                   │ fetch wrapper +  │
        │ blindIndex ·   │                   │ token refresh    │
        │ normalize      │                   │ interceptor      │
        └────────────────┘                   └────────┬─────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │  HaramBall API   │
                                              │   (Backend)      │
                                              └──────────────────┘

  Platform adapters (secure-store / biometric / clipboard) are
  injected into Vault/Session and copy features behind interfaces.
```

### Module Responsibilities

- **Crypto Module** (`src/crypto`): pure, side-effect-free functions. Derives keys, encrypts/decrypts, computes blind indexes, normalizes text. No knowledge of API or UI. The only stateful concern is libsodium initialization (`await ready`).
- **API Client** (`src/api`): typed `fetch` wrapper. Attaches the Access Token, handles 401 → refresh → retry-once, parses the consistent error envelope. Knows nothing about crypto.
- **Domain Services** (`src/services`): orchestration. `EntryService.create()` takes plaintext, calls crypto to encrypt + build indexes, then calls the API client. `SearchService.byTitle()` normalizes + hashes the query then calls the API and decrypts results. `AuthService` derives the auth hash and calls login/register.
- **Vault/Session Store** (`src/vault`): Zustand store holding `encryptionKey`, `indexKey`, lock state, and the decrypted entry cache. Coordinates lock/unlock, biometric retrieval, and key zeroing.
- **Platform Adapters** (`src/platform`): thin wrappers over `expo-secure-store`, `expo-local-authentication`, `expo-clipboard`, with web no-op / in-memory fallbacks selected via `Platform.OS` or `.native.ts` / `.web.ts` file resolution.
- **UI** (`app/` + `src/features`): Expo Router routes and feature components. Subscribe to the store and query hooks; contain no crypto.

## Cryptographic Design

This is the contract-critical section. All values that the backend stores/searches are produced here.

### Key Derivation

```
Master_Key   = argon2id(
                  password = masterPassword,
                  salt     = blake2b(email, len=16),   // deterministic per-user salt
                  opslimit = INTERACTIVE_OR_MODERATE,
                  memlimit = INTERACTIVE_OR_MODERATE,
                  outlen   = 32 )

Encryption_Key = crypto_kdf_derive_from_key(subkey_id=1, ctx="hb-enc__", masterKey)
Index_Key      = crypto_kdf_derive_from_key(subkey_id=2, ctx="hb-idx__", masterKey)
Auth_Hash      = base64( crypto_kdf_derive_from_key(subkey_id=3, ctx="hb-auth_", masterKey) )
```

- Salt is derived deterministically from the email (BLAKE2b) so any device can re-derive without a server round-trip for a salt. (Bitwarden-style.) Email is normalized (trim + lowercase) before hashing.
- Domain-separated contexts (`crypto_kdf` 8-byte context) prevent cross-use of subkeys.
- `Auth_Hash` is the value sent to the backend as `Account_Password`. The Master Password and Master_Key never leave the device.
- **Argon2 parameters are pinned as constants** and documented; changing them is a versioned migration (see Versioning).

### Encryption / Decryption

```
encrypt(plaintext, encKey):
    nonce = randombytes(24)                         // XChaCha20 nonce
    ct    = crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, null, nonce, encKey)
    return base64(nonce || ct)                      // envelope = nonce + ciphertext+tag

decrypt(envelope, encKey):
    raw   = base64_decode(envelope)
    nonce = raw[0:24]; ct = raw[24:]
    return crypto_aead_xchacha20poly1305_ietf_decrypt(ct, null, nonce, encKey)
```

- Each Title, Body, and Tag is encrypted independently with a fresh random nonce.
- The wire format is a versioned envelope string: `v1.<base64(nonce||ct)>`. The version prefix enables future algorithm changes.
- Decryption failure (bad tag / wrong key) raises a typed `DecryptionError` surfaced to the UI per Req 5.4.

### Blind Index (Searchable Encryption)

Normalization (shared by title tokens, tag values, and search queries):

```
normalize(s) = stripDiacritics(s.trim().toLowerCase())
```

Keyed hash:

```
blindIndex(value, indexKey) =
    base64( crypto_generichash(out=16, in=normalize(value), key=indexKey) )   // keyed BLAKE2b
```

**Title prefix index** (enables chat-style prefix search per Req 10.3):

```
buildTitlePrefixIndex(title, indexKey):
    tokens = normalize(title).split(/\s+/)
    set = {}
    for token in tokens:
        for k in [MIN_PREFIX .. len(token)]:        // MIN_PREFIX = 2
            set.add( blindIndex(token[0:k], indexKey) )
    // privacy padding: pad set to a multiple of PAD_BUCKET with random
    // 16-byte indexes so the server cannot infer exact title length
    return pad(set, PAD_BUCKET)
```

- At create/update time the App sends this set of title-prefix blind indexes plus one blind index per tag.
- At search time, the App computes `blindIndex(query)` and the backend matches it against any stored title-prefix index (equality match on the server, prefix semantics emerge from the stored prefixes).
- **Tag search** sends `blindIndex(tag)` per tag; backend matches equality.
- Padding to a fixed bucket size mitigates the metadata leak of "number of prefixes ≈ title length."

> Note: the exact wire contract for index field names must match the backend. This is captured as an explicit integration checkpoint (see Open Integration Points) and must be confirmed against `HaramBall-Back` before/while implementing the search task.

### Entry Plaintext / Ciphertext Mapping

```
Plaintext entry (client):                 Encrypted payload (to backend):
  title:  "Bancamiga"            ─────►     encryptedTitle:  "v1.<...>"
  body:   "user@x\nPASSWORD"     ─────►     encryptedBody:   "v1.<...>"
  tags:   ["banca","vzla"]       ─────►     encryptedTags:   ["v1.<...>","v1.<...>"]
                                            titleIndex:      ["b64idx", ...]   // prefix set
                                            tagIndexes:      ["b64idx", ...]   // one per tag
```

## Components and Interfaces

The system is composed of pure modules (crypto), orchestration services, an API client, a state store, and platform adapters behind interfaces so web/native differences and the backend contract stay isolated and testable.

### Crypto Module

```typescript
// src/crypto/kdf.ts
function deriveMasterKey(masterPassword: string, email: string): Promise<Uint8Array>;
function deriveSubkeys(masterKey: Uint8Array): {
  encryptionKey: Uint8Array;
  indexKey: Uint8Array;
  authHash: string;            // base64, sent as Account_Password
};

// src/crypto/cipher.ts
function encrypt(plaintext: string, encKey: Uint8Array): string;   // "v1.<base64(nonce||ct)>"
function decrypt(envelope: string, encKey: Uint8Array): string;    // throws DecryptionError

// src/crypto/blindIndex.ts
function blindIndex(value: string, indexKey: Uint8Array): string;  // base64 keyed BLAKE2b
function buildTitlePrefixIndex(title: string, indexKey: Uint8Array): string[];

// src/crypto/normalize.ts
function normalize(s: string): string;                              // lowercase, trim, strip diacritics
```

### Domain Services

```typescript
// src/services/AuthService.ts
interface AuthService {
  register(email: string, masterPassword: string): Promise<void>;
  login(email: string, masterPassword: string): Promise<{ keys: SessionKeys; tokens: AuthTokens }>;
  logout(): Promise<void>;
}

// src/services/EntryService.ts
interface EntryService {
  list(): Promise<PlainEntry[]>;                                    // fetch + decrypt
  get(id: string): Promise<PlainEntry>;
  create(title: string, body: string, tags: string[]): Promise<PlainEntry>;
  update(id: string, title: string, body: string, tags: string[]): Promise<PlainEntry>;
  remove(id: string): Promise<void>;
}

// src/services/SearchService.ts
interface SearchService {
  byTitle(query: string): Promise<PlainEntry[]>;                    // normalize → blindIndex → API → decrypt
  byTags(tags: string[]): Promise<PlainEntry[]>;
}
```

Services receive `SessionKeys` from the Vault store (injected), so they remain stateless and unit-testable with real crypto + mocked API.

### API Client

```typescript
// src/api/client.ts
interface ApiClient {
  request<T>(opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    auth?: boolean;                 // attach Access_Token
    schema?: ZodSchema<T>;          // validate response
  }): Promise<T>;
}
// Handles: token attach, 401 → single-flight refresh → retry-once, error envelope mapping.
```

### Vault / Session Store

```typescript
// src/vault/vaultStore.ts  (Zustand) — shape defined in Data Models
// Selectors expose status, decrypted entries, and a getter for SessionKeys.
// lock() zeroes key buffers and clears the decrypted entry cache.
```

### Platform Adapters (interfaces with .native.ts / .web.ts implementations)

```typescript
interface SecureStoreAdapter {
  save(key: string, value: string): Promise<void>;  // native: Keychain/Keystore; web: throws/no-op
  read(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  isAvailable(): boolean;
}

interface BiometricAdapter {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
}

interface ClipboardAdapter {
  copy(value: string): Promise<void>;
  scheduleClear(value: string, timeoutMs: number): void;  // best-effort auto-clear
}
```

### UI Components (key reusable pieces)

- `SearchBar` — debounced chat-style input driving `SearchService.byTitle`.
- `EntryCard` — shows decrypted title, expand affordance, body copy button.
- `FieldCopyRow` — per-line detected field with its own copy button + confirmation.
- `TagInput` — add/remove tags on create/edit.
- `LockOverlay` — blur/cover shown when backgrounded or locked.

## Correctness Properties

These are invariants the implementation and tests must uphold.

### Property 1: Encryption round-trip
For any string `m` and key `k`, `decrypt(encrypt(m, k), k) === m`.

**Validates: Requirements 5.3, 5.4**

### Property 2: Tamper-evidence
Modifying any byte of an envelope causes `decrypt` to throw `DecryptionError`; it never returns wrong plaintext silently.

**Validates: Requirements 5.4**

### Property 3: Wrong-key safety
`decrypt(envelope, k2)` with `k2 ≠ k` throws rather than returning data.

**Validates: Requirements 5.4**

### Property 4: Blind-index determinism
`blindIndex(v, k)` is stable across runs, platforms (web/native), and app restarts for the same normalized `v` and key `k`.

**Validates: Requirements 10.1, 10.2, 11.1**

### Property 5: Normalization equivalence
Inputs differing only by case, surrounding whitespace, or diacritics produce the same blind index (e.g. `"Bancámiga "` and `"bancamiga"`).

**Validates: Requirements 10.1, 10.3**

### Property 6: Prefix coverage
For a title token `t` and any prefix `p` of `t` with `len(p) ≥ MIN_PREFIX`, `blindIndex(p, k)` is a member of `buildTitlePrefixIndex(title, k)`.

**Validates: Requirements 10.3, 6.3, 8.1**

### Property 7: Key isolation
`encryptionKey`, `indexKey`, and `authHash` are pairwise distinct, and one cannot be derived from another without the master key (domain-separated contexts).

**Validates: Requirements 5.2, 1.2**

### Property 8: No secret egress
No network request body or query contains the Master_Password, Master_Key, Encryption_Key, Index_Key, or any plaintext title/body/tag.

**Validates: Requirements 1.3, 2.1, 5.3**

### Property 9: No secret at rest on Web
On Web, no key material is written to `localStorage`, `sessionStorage`, IndexedDB, or cookies.

**Validates: Requirements 4.4, 15.4**

### Property 10: No secret in logs
Log/crash output excludes secrets, ciphertext, and blind-index inputs.

**Validates: Requirements 5.6, 15.1**

### Property 11: Lock clears secrets
After `lock()`, `keys === null` and the decrypted entry cache is empty.

**Validates: Requirements 5.5, 4.5, 15.2**

### Property 12: Locked implies no plaintext
While `status !== 'unlocked'`, no decrypted entry content is present in any rendered component.

**Validates: Requirements 3.5, 4.6, 15.2**

### Property 13: Ownership scoping
The UI only renders entries returned by the backend for the authenticated account; there is no client-side cross-account state.

**Validates: Requirements 7.1, 10.2, 11.2**

## Data Models

### Domain Types (client-side)

```typescript
// Decrypted, in-memory only
interface PlainEntry {
  id: string;
  title: string;          // first line
  body: string;           // remaining lines
  tags: string[];
  createdAt: string;      // ISO from backend
  updatedAt: string;
}

// Wire format exchanged with backend (ciphertext + indexes)
interface EncryptedEntryPayload {
  encryptedTitle: string;     // "v1.<base64>"
  encryptedBody: string;
  encryptedTags: string[];
  titleIndex: string[];       // prefix blind-index set
  tagIndexes: string[];       // blind index per tag
}

interface EntryResponse {     // what backend returns
  id: string;
  encryptedTitle: string;
  encryptedBody: string;
  encryptedTags: string[];
  createdAt: string;
  updatedAt: string;
}

interface SessionKeys {       // never persisted in plaintext (web); native via secure store
  encryptionKey: Uint8Array;
  indexKey: Uint8Array;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
```

### Vault Store Shape (Zustand)

```typescript
interface VaultState {
  status: 'locked' | 'unlocking' | 'unlocked';
  keys: SessionKeys | null;           // cleared on lock
  entries: Record<string, PlainEntry>; // decrypted cache
  tokens: AuthTokens | null;
  // actions
  unlockWithPassword(email, masterPassword): Promise<void>;
  unlockWithBiometrics(): Promise<void>;
  lock(): void;                        // zeroes keys, clears entries
  logout(): Promise<void>;
}
```

### Entry Text Parsing

```
parseEntryText(text):
    lines = text.split("\n")
    title = lines[0].trim()
    body  = lines.slice(1).join("\n")
    return { title, body }

// Reverse for editing: serialize = title + "\n" + body
```

### Labeled-line Detection (for per-line copy, Req 12.2)

```
LABELS = /^(clave|password|contraseña|usuario|user|ip|servidor|server|email|correo)\s*:?/i
EMAIL  = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/

detectFields(body):
    for each line:
        if LABELS matches → field { label, value = text after ":" }
        else if EMAIL matches → field { label: "email", value: match }
    return fields    // each gets its own copy button
```

## API Integration

### Endpoints Consumed (contract assumptions)

| Action | Method | Path | Auth |
|---|---|---|---|
| Register | POST | `/auth/register` | none |
| Login | POST | `/auth/login` | none |
| Refresh | POST | `/auth/refresh` | refresh token |
| Logout | POST | `/auth/logout` | refresh token |
| List entries | GET | `/entries` | access token |
| Get entry | GET | `/entries/:id` | access token |
| Create entry | POST | `/entries` | access token |
| Update entry | PUT | `/entries/:id` | access token |
| Delete entry | DELETE | `/entries/:id` | access token |
| Search by title | POST/GET | `/entries/search` (title index) | access token |
| Search by tags | POST/GET | `/entries/search` (tag indexes) | access token |

> Exact paths, request shapes, and index field names are an **integration checkpoint** to confirm against `HaramBall-Back`. The API client centralizes these so changes are localized.

### Token Refresh Flow

```
Request → attach Access_Token
        → 401?
            → has Refresh_Token? → POST /auth/refresh
                → success → store new Access_Token → retry original ONCE
                → failure → lock vault + clear session + route to /login
            → no refresh token → route to /login
        → 2xx → return parsed body
        → other error → throw typed ApiError(code, message)
```

A single-flight guard ensures concurrent 401s trigger only one refresh request.

### Error Envelope

```typescript
interface ApiError { code: string; message: string; status: number; }
```

The client maps HTTP status + backend envelope to user-facing messages; raw details and stack traces are never shown (Req 14.3).

## Sequence Flows

### Login + Unlock

```
User → LoginScreen: email + masterPassword
LoginScreen → AuthService: login(email, pw)
AuthService → Crypto: deriveMasterKey(pw, salt=hash(email))
Crypto → AuthService: masterKey → {encKey, indexKey, authHash}
AuthService → API: POST /auth/login {email, password: authHash}
API → AuthService: 200 {accessToken, refreshToken}
AuthService → VaultStore: setKeys(encKey, indexKey), setTokens(...)
VaultStore: status = 'unlocked'
[native + opted-in] VaultStore → SecureStore: store(masterKey, refreshToken) behind biometrics
UI → EntriesQuery: fetch + decrypt titles → render chat list
```

### Biometric Unlock on Launch (native)

```
App launch → status 'locked'
VaultStore → Biometric: authenticate()
  success → SecureStore: read(masterKey, refreshToken)
          → Crypto: derive {encKey, indexKey}
          → API: POST /auth/refresh → new accessToken
          → status 'unlocked'
  fail/cancel → show Master_Password fallback
```

### Create Entry

```
User → EditorScreen: types free-form text + tags
EditorScreen → parseEntryText → {title, body}
EntryService.create(title, body, tags):
   encTitle = encrypt(title, encKey)
   encBody  = encrypt(body, encKey)
   encTags  = tags.map(encrypt)
   titleIndex = buildTitlePrefixIndex(title, indexKey)
   tagIndexes = tags.map(t => blindIndex(t, indexKey))
   → API POST /entries {encTitle, encBody, encTags, titleIndex, tagIndexes}
   → 201 {id, timestamps}
   → VaultStore.upsert(PlainEntry)   // optimistic, decrypted already in hand
```

### Chat-Style Search

```
User types "banca"
  → debounce 250ms
  → q = normalize("banca"); idx = blindIndex(q, indexKey)
  → API search by titleIndex = idx
  → results (encrypted) → decrypt titles → render
empty query → show full list
```

## State, Locking, and Background Behavior

- **Auto-lock**: an `AppState` listener (native) and `visibilitychange` (web) start a timer when backgrounded; on timeout the store `lock()`s (zeroes keys, clears decrypted cache). Configurable timeout.
- **App-switcher privacy** (native): render a blur/cover overlay on `inactive`/`background` (Reanimated) so the OS preview doesn't show entries (Req 15.3).
- **Web**: keys never persisted; reload ⇒ relock ⇒ master password re-entry.

## Error Handling

| Scenario | Handling |
|---|---|
| Decryption failure | typed `DecryptionError`; per-entry error state in list; full-screen error if it indicates wrong key |
| 401 (expired) | refresh + retry once; else logout/route to login |
| 409 register | "email already in use" message |
| 413 create/update | "entry too large" message |
| 429 auth | rate-limit message + `Retry-After` countdown |
| 404 entry | remove from cache + inform user |
| 500 / network | generic message + retry affordance; no internals shown |
| Validation (400) | map to field-level form errors via Zod + backend field info |

A top-level React error boundary catches render errors and shows a safe fallback without leaking state.

## Project Structure

```
app/                         # Expo Router routes (web + native)
  _layout.tsx                # root: providers, auth gate, lock overlay
  (auth)/login.tsx
  (auth)/register.tsx
  (vault)/index.tsx          # chat-style list + search
  (vault)/entry/[id].tsx     # detail + copy
  (vault)/entry/new.tsx
  (vault)/entry/[id]/edit.tsx
src/
  crypto/
    sodium.ts                # init/ready singleton
    kdf.ts                   # deriveMasterKey, deriveSubkeys
    cipher.ts                # encrypt/decrypt envelope
    blindIndex.ts            # blindIndex, buildTitlePrefixIndex
    normalize.ts             # normalize, stripDiacritics
    errors.ts                # DecryptionError
  api/
    client.ts                # fetch wrapper + refresh interceptor
    auth.ts  entries.ts  search.ts
    schemas.ts               # Zod response schemas
  services/
    AuthService.ts  EntryService.ts  SearchService.ts
  vault/
    vaultStore.ts            # Zustand store
    autolock.ts
  platform/
    secureStore.native.ts / .web.ts
    biometric.native.ts / .web.ts
    clipboard.ts
  features/
    auth/  vault/  entry/    # screen-level components
  ui/                        # Card, SearchBar, CopyButton, TagInput, ...
  config/
    env.ts                   # reads EXPO_PUBLIC_* env
  utils/
    entryText.ts             # parseEntryText, detectFields
__tests__/                   # crypto + service unit tests
.env.example
```

## Configuration & Environment

- Backend base URL and tunables read from `EXPO_PUBLIC_*` env vars via `src/config/env.ts` (validated with Zod at startup; missing required vars fail fast).
- `.env` git-ignored; `.env.example` documents required variables (`EXPO_PUBLIC_API_BASE_URL`, lock timeout, clipboard clear timeout, Argon2 profile).
- Crypto constants (Argon2 params, `MIN_PREFIX`, `PAD_BUCKET`, envelope version) centralized in `src/crypto` as pinned constants, not env-driven, to guarantee cross-device consistency.

## Versioning & Migration

- Envelope version prefix (`v1.`) on every ciphertext.
- Argon2 parameters and KDF contexts are versioned constants; any change requires a re-encryption migration triggered after unlock. Out of scope for v1 implementation but the version prefix reserves the capability.

## Testing Strategy

- **Crypto unit tests (highest priority)**: determinism of `blindIndex` and `buildTitlePrefixIndex`; encrypt→decrypt round-trips; tamper detection (modified ciphertext fails auth); normalization (accents, case, spaces); known-answer vectors to lock the contract.
- **Service tests**: `EntryService`/`SearchService` with mocked API + real crypto, asserting correct payload shapes (title index sets, tag indexes).
- **API client tests**: 401 → refresh → retry-once; single-flight refresh; error mapping.
- **Component tests**: search debounce + empty state; copy confirmation; lock overlay hides content; per-line field detection.
- **Platform adapters**: mocked secure-store/biometric; verify web never persists keys.

## Open Integration Points (to confirm with HaramBall-Back)

1. Exact endpoint paths and request/response field names (esp. the index field names and search request shape).
2. Search semantics: server treats the title-prefix set as equality-matchable values (our prefix approach) — confirm the backend stores and matches the set as designed.
3. Maximum entry size (for the 413 message) and the structure of validation (400) error fields.
4. Whether refresh returns a rotated refresh token (affects what we re-persist behind biometrics).

These are isolated in the API client and SearchService so confirming them does not ripple through the UI.

## Requirements Coverage

| Requirement | Addressed by |
|---|---|
| R1 Registration | AuthService, Crypto KDF, register form validation |
| R2 Login | AuthService, VaultStore unlock, login flow |
| R3 Session/tokens | API client refresh interceptor, logout flow |
| R4 Biometric/lock | platform/biometric, secureStore, autolock |
| R5 Encryption/KDF | Crypto module (kdf, cipher) |
| R6 Create | EntryService.create, editor parsing |
| R7 List/retrieve | EntriesQuery, decrypt-on-display |
| R8 Edit | EntryService.update |
| R9 Delete | EntryService.delete + confirm dialog |
| R10 Title search | SearchService, buildTitlePrefixIndex, debounce |
| R11 Tag search | SearchService tag indexes |
| R12 Copy | utils/detectFields, CopyButton, clipboard auto-clear |
| R13 Cross-platform | Expo Router, platform adapters, responsive UI |
| R14 API errors | API client error mapping, Zod schemas |
| R15 Client hygiene | log scrubbing, lock overlay, secure-store-only persistence |
