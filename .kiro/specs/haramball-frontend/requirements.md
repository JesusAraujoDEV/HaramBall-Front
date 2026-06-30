# Requirements Document

## Introduction

This document defines the requirements for the **frontend** of HaramBall, a personal, zero-knowledge password manager. The frontend (repository `HaramBall-Front`) is a cross-platform application built with **React Native + Expo** that runs on **iOS, Android, and Web** from a single codebase.

The application lets a user store credential entries as free-form text where the **first line is the title** (the chat-style search key) and the remaining lines form the **body**. Entries may be simple (service / email / password) or structured (server / IP / user / password), so the body is treated as opaque multi-line text.

The frontend implements the **client side of a zero-knowledge security model**. The user's **Master Password** never leaves the device. From it, the client derives, using a memory-hard KDF (Argon2id):

- an **encryption key** used to encrypt every Title, Body, and Tag with authenticated encryption before transmission,
- a **blind-index key** used to compute deterministic keyed hashes (BLAKE2b) that enable the server to perform equality and prefix search without ever seeing plaintext,
- an **auth hash** that is sent to the backend as the `Account_Password`, so the Master Password itself is never transmitted.

The frontend communicates with the existing HaramBall backend REST API (repository `HaramBall-Back`) for registration, authentication, token refresh/logout, and CRUD + search over entries. The backend stores and returns ciphertext and blind indexes only.

Key experience goals: a **chat-style search** as the primary interaction, **biometric unlock** (fingerprint / Face ID) on native devices, and **one-tap copy** of the body and of individual sensitive lines (e.g. password, user).

The backend service, its database, and its internal implementation are **out of scope** for this specification.

## Glossary

- **App**: The HaramBall frontend application running on iOS, Android, or Web.
- **User**: The person operating the App.
- **Backend**: The existing HaramBall REST API consumed by the App. Out of scope except as an integration contract.
- **Master_Password**: The single secret the User types. Never transmitted to or persisted on the Backend. Source of all derived keys.
- **Master_Key**: The key material derived from the Master_Password via Argon2id (salt = User email).
- **Encryption_Key**: A subkey derived from the Master_Key, used to encrypt and decrypt Title, Body, and Tags.
- **Index_Key**: A subkey derived from the Master_Key, used to compute Blind_Index values.
- **Auth_Hash**: A value derived from the Master_Key and sent to the Backend as the `Account_Password`. Distinct from the Master_Password.
- **Vault**: The User's full set of decrypted entries available in memory after unlock.
- **Vault_Locked / Vault_Unlocked**: The state of the App regarding whether the Encryption_Key is available in memory.
- **Entry**: A credential record. Holds an encrypted Title, encrypted Body, and zero or more encrypted Tags, plus identifier and timestamps returned by the Backend.
- **Title**: The first line of an Entry's content. The primary chat-style search key.
- **Body**: The Entry content after the first line. Opaque multi-line text.
- **Tag**: A label associated with an Entry for grouping and search.
- **Ciphertext**: Encrypted data produced by the App via authenticated encryption (XChaCha20-Poly1305).
- **Blind_Index**: A deterministic, keyed BLAKE2b hash of a normalized plaintext value, computed by the App and sent to the Backend for search.
- **Title_Prefix_Index**: The set of Blind_Index values computed from the normalized tokens and token prefixes of a Title, enabling prefix (chat-style) search.
- **Access_Token**: A short-lived JWT returned by the Backend, attached to protected API requests.
- **Refresh_Token**: A longer-lived token used to obtain a new Access_Token.
- **Secure_Store**: The platform secure storage (iOS Keychain / Android Keystore via `expo-secure-store`) used on native devices.
- **Biometric_Unlock**: Unlocking the App using device biometrics (fingerprint / Face ID) via `expo-local-authentication`.
- **Copy_Action**: Copying a value to the device clipboard.

## Requirements

### Requirement 1: Account Registration

**User Story:** As a new user, I want to register with my email and a master password, so that I can start storing credentials under a zero-knowledge account.

#### Acceptance Criteria

1. WHEN the User submits the registration form with an email and a Master_Password, THE App SHALL derive the Master_Key locally using Argon2id with the email as salt before contacting the Backend.
2. THE App SHALL derive the Encryption_Key, Index_Key, and Auth_Hash from the Master_Key and SHALL send only the Auth_Hash to the Backend as the `Account_Password`.
3. THE App SHALL NOT transmit the Master_Password or any derived encryption key material to the Backend.
4. IF the entered Master_Password is shorter than 12 characters, THEN THE App SHALL block submission and display a descriptive validation message.
5. IF the entered email does not conform to a valid email format, THEN THE App SHALL block submission and display a descriptive validation message.
6. WHERE a Master_Password confirmation field is shown, IF the confirmation does not match the Master_Password, THEN THE App SHALL block submission and display a descriptive validation message.
7. WHEN the Backend responds with HTTP 201, THE App SHALL treat registration as successful and proceed to the authenticated state or the login screen.
8. IF the Backend responds with HTTP 409 (email already registered), THEN THE App SHALL display a descriptive message indicating the email is already in use.
9. WHEN the App displays Master_Password strength feedback, THE App SHALL prominently warn the User that a forgotten Master_Password cannot be recovered and makes existing entries permanently unreadable.

### Requirement 2: Account Authentication (Login)

**User Story:** As a registered user, I want to log in with my email and master password, so that I can access and decrypt my entries.

#### Acceptance Criteria

1. WHEN the User submits the login form with an email and Master_Password, THE App SHALL derive the Master_Key, Encryption_Key, Index_Key, and Auth_Hash locally and send only the Auth_Hash to the Backend as the `Account_Password`.
2. WHEN the Backend responds with HTTP 200 and tokens, THE App SHALL store the Access_Token and Refresh_Token, retain the Encryption_Key and Index_Key in memory, and transition to the Vault_Unlocked state.
3. IF the Backend responds with HTTP 401, THEN THE App SHALL display a generic authentication-failure message that does not reveal whether the email exists.
4. IF the Backend responds with HTTP 429, THEN THE App SHALL display a rate-limit message and, WHERE a `Retry-After` value is provided, indicate when the User may retry.
5. THE App SHALL NOT persist the Master_Password or the Master_Key in plaintext to any storage.
6. WHILE the App is contacting the Backend during login, THE App SHALL display a loading indicator and SHALL prevent duplicate submissions.

### Requirement 3: Session and Token Management

**User Story:** As an authenticated user, I want my session to refresh and end cleanly, so that I stay logged in safely and can sign out.

#### Acceptance Criteria

1. WHEN a protected API request returns HTTP 401 due to an expired Access_Token AND a valid Refresh_Token is available, THE App SHALL request a new Access_Token using the Refresh_Token and retry the original request once.
2. IF the refresh request fails or the Refresh_Token is invalid or expired, THEN THE App SHALL clear session state, lock the Vault, and route the User to the login screen.
3. WHEN the User chooses to log out, THE App SHALL call the Backend logout endpoint to invalidate the Refresh_Token, clear all in-memory keys and tokens, and clear any biometric-protected stored material.
4. THE App SHALL attach the Access_Token to every request to a protected Backend endpoint.
5. WHILE the Vault is Vault_Locked, THE App SHALL NOT display decrypted Entry content.

### Requirement 4: Biometric Unlock and App Lock

**User Story:** As a mobile user, I want to unlock the app with my fingerprint or face, so that I get fast access without retyping my master password every time.

#### Acceptance Criteria

1. WHERE the platform is native (iOS/Android) AND device biometrics are enrolled, WHEN the User opts in after a successful login, THE App SHALL store the Master_Key and Refresh_Token in Secure_Store protected behind Biometric_Unlock.
2. WHEN the App launches on a native device with biometric unlock enabled, THE App SHALL prompt for Biometric_Unlock and, on success, retrieve the Master_Key, derive the session keys, and refresh the Access_Token.
3. IF Biometric_Unlock fails or is canceled, THEN THE App SHALL remain Vault_Locked and offer Master_Password entry as a fallback.
4. WHERE the platform is Web, THE App SHALL NOT persist the Master_Key to disk and SHALL keep it only in memory for the duration of the session.
5. WHEN the App moves to the background or is inactive beyond a configurable timeout, THE App SHALL lock the Vault and clear decrypted content from view.
6. WHEN the Vault is Vault_Locked, THE App SHALL require Biometric_Unlock or Master_Password entry before exposing any Entry content.

### Requirement 5: Client-Side Encryption and Key Derivation

**User Story:** As a privacy-conscious user, I want all my content encrypted on my device, so that the server never sees my plaintext.

#### Acceptance Criteria

1. THE App SHALL derive the Master_Key from the Master_Password using Argon2id with parameters at least as strong as the agreed defaults, using the User email as salt.
2. THE App SHALL derive the Encryption_Key, Index_Key, and Auth_Hash from the Master_Key using a key-derivation function with domain-separated contexts.
3. THE App SHALL encrypt every Title, Body, and Tag using authenticated encryption (XChaCha20-Poly1305) with a unique nonce per encryption operation before sending it to the Backend.
4. THE App SHALL decrypt Ciphertext received from the Backend using the in-memory Encryption_Key and SHALL surface a clear error WHEN authentication of the Ciphertext fails.
5. THE App SHALL hold the Encryption_Key, Index_Key, and Master_Key only in memory while the Vault is Vault_Unlocked and SHALL clear them from memory when the Vault locks.
6. THE App SHALL NOT write the Master_Password, Master_Key, Encryption_Key, or Index_Key to logs.

### Requirement 6: Entry Creation

**User Story:** As an authenticated user, I want to create an entry by typing free-form text, so that I can store a credential the way I already write it.

#### Acceptance Criteria

1. THE App SHALL treat the first line of the entry text as the Title and the remaining lines as the Body.
2. IF the entry text is empty or the first line (Title) is blank, THEN THE App SHALL block submission and display a descriptive validation message.
3. WHEN the User submits a new Entry, THE App SHALL encrypt the Title, Body, and each Tag, compute the Title_Prefix_Index and a Blind_Index for each Tag, and send the Ciphertext and Blind_Index values to the Backend.
4. WHEN the Backend responds with HTTP 201, THE App SHALL add the new Entry to the in-memory Vault and reflect it in the entry list without requiring a full reload.
5. IF the Backend responds with HTTP 413 (entry too large), THEN THE App SHALL display a descriptive message indicating the entry exceeds the maximum size.
6. THE App SHALL allow the User to add and remove Tags on an Entry before submission.

### Requirement 7: Entry Listing and Retrieval

**User Story:** As an authenticated user, I want to see and open my entries, so that I can read my stored credentials.

#### Acceptance Criteria

1. WHEN the Vault becomes Vault_Unlocked, THE App SHALL fetch the User's Entries from the Backend and decrypt their Title for display in the list.
2. WHEN the User opens an Entry, THE App SHALL decrypt and display the Title, Body, and Tags.
3. WHILE decryption of a listed Entry is in progress or fails, THE App SHALL indicate the loading or error state for that Entry without crashing the list.
4. IF the Backend responds with HTTP 404 for a requested Entry, THEN THE App SHALL remove it from the in-memory Vault and inform the User the Entry no longer exists.
5. THE App SHALL display Entry timestamps (created/updated) returned by the Backend in a human-readable, localized format.

### Requirement 8: Entry Editing

**User Story:** As an authenticated user, I want to edit an entry, so that I can update a credential when it changes.

#### Acceptance Criteria

1. WHEN the User edits an Entry and saves, THE App SHALL re-encrypt the Title, Body, and Tags, recompute the Title_Prefix_Index and Tag Blind_Index values, and send the updated Ciphertext and Blind_Index values to the Backend.
2. WHEN the Backend responds with HTTP 200, THE App SHALL update the Entry in the in-memory Vault and refresh its display.
3. IF the Backend responds with HTTP 404, THEN THE App SHALL inform the User the Entry no longer exists and remove it from the in-memory Vault.
4. WHEN editing, THE App SHALL keep the first line as the Title and the remaining lines as the Body, consistent with creation.

### Requirement 9: Entry Deletion

**User Story:** As an authenticated user, I want to delete an entry, so that I can remove credentials I no longer need.

#### Acceptance Criteria

1. WHEN the User requests deletion of an Entry, THE App SHALL ask for explicit confirmation before contacting the Backend.
2. WHEN the User confirms deletion AND the Backend responds with HTTP 204, THE App SHALL remove the Entry from the in-memory Vault and from the displayed list.
3. IF the Backend responds with HTTP 404, THEN THE App SHALL remove the Entry from the in-memory Vault and inform the User it no longer exists.
4. WHEN deletion fails due to a network or server error, THE App SHALL keep the Entry visible and display a descriptive error.

### Requirement 10: Chat-Style Search by Title

**User Story:** As an authenticated user, I want to type part of a title and see matching entries, so that I can find a credential quickly like in a chat.

#### Acceptance Criteria

1. WHEN the User types into the search input, THE App SHALL normalize the query (lowercase, trim, strip diacritics) and compute the corresponding Blind_Index using the Index_Key.
2. THE App SHALL request matching Entries from the Backend using the Title Blind_Index and SHALL display the returned Entries with their decrypted Titles.
3. THE App SHALL support prefix matching so that a partial Title query (e.g. "banca") matches Entries whose Title begins with or contains a token starting with that query (e.g. "Bancamiga").
4. THE App SHALL debounce search requests so that rapid typing does not issue an excessive number of Backend calls.
5. IF a search yields no results, THEN THE App SHALL display an empty-state message rather than an error.
6. WHEN the search input is cleared, THE App SHALL return to displaying the full entry list.

### Requirement 11: Search by Tags

**User Story:** As an authenticated user, I want to filter entries by tag, so that I can see all credentials under a label.

#### Acceptance Criteria

1. WHEN the User selects or enters one or more Tags to search, THE App SHALL compute the Blind_Index for each Tag and request matching Entries from the Backend.
2. THE App SHALL display the Entries returned for the Tag search with their decrypted Titles.
3. IF a Tag search yields no results, THEN THE App SHALL display an empty-state message rather than an error.
4. WHEN the User clears the Tag filter, THE App SHALL return to displaying the full entry list.

### Requirement 12: One-Tap Copy

**User Story:** As an authenticated user, I want to copy a credential with one tap, so that I can paste it quickly without selecting text.

#### Acceptance Criteria

1. WHEN the User triggers a Copy_Action on an Entry, THE App SHALL copy the full decrypted Body to the clipboard.
2. WHERE a Body line is recognized as a labeled field (e.g. a line containing an email, or prefixed with "Clave:", "Usuario:", "Password:", "IP:"), THE App SHALL offer a per-line Copy_Action for that value.
3. WHEN a Copy_Action completes, THE App SHALL show a brief confirmation to the User.
4. WHERE the platform supports it, THE App SHALL clear copied sensitive values from the clipboard after a configurable timeout.
5. THE App SHALL perform Copy_Actions on already-decrypted in-memory values and SHALL NOT send the value to the Backend to perform a copy.

### Requirement 13: Cross-Platform Support

**User Story:** As a user with multiple devices, I want the app to work on my phone and in the browser, so that I can access my credentials anywhere.

#### Acceptance Criteria

1. THE App SHALL run on iOS, Android, and Web from a single codebase.
2. THE App SHALL provide responsive layouts suitable for both mobile (touch) and web (pointer/keyboard) form factors.
3. WHERE a capability is platform-specific (Secure_Store, Biometric_Unlock, clipboard auto-clear), THE App SHALL degrade gracefully on platforms that do not support it without breaking core flows.
4. THE App SHALL provide equivalent core functionality (create, read, update, delete, search, copy) on all supported platforms.

### Requirement 14: API Integration and Error Handling

**User Story:** As a user, I want clear feedback when something goes wrong, so that I understand what happened and what to do.

#### Acceptance Criteria

1. THE App SHALL read the Backend base URL and other environment-specific configuration from environment configuration rather than hardcoded literals.
2. WHEN a Backend request fails with a network error, THE App SHALL display a descriptive, non-technical error message and offer a retry where appropriate.
3. WHEN the Backend returns a structured error (error code + message), THE App SHALL surface a human-readable message and SHALL NOT display raw stack traces or internal details.
4. WHEN the Backend returns HTTP 500, THE App SHALL display a generic failure message and allow the User to retry the action.
5. THE App SHALL handle HTTP 400 validation errors by indicating which submitted fields were rejected where the Backend identifies them.

### Requirement 15: Security Hygiene of the Client

**User Story:** As a privacy-conscious user, I want the app itself to avoid leaking my secrets, so that my data stays safe even on my own device.

#### Acceptance Criteria

1. THE App SHALL exclude Ciphertext, Master_Password, derived keys, and Blind_Index inputs from console logs and crash reports.
2. WHILE the Vault is Vault_Locked, THE App SHALL NOT retain decrypted Entry content in component state or view.
3. WHERE the platform supports it, THE App SHALL hide sensitive content from the OS app switcher / preview when the App is backgrounded.
4. THE App SHALL store tokens and key material only in Secure_Store on native platforms and only in memory on Web.
5. THE App SHALL NOT commit secrets or real Backend URLs to source control and SHALL provide example environment configuration documenting required variables.
