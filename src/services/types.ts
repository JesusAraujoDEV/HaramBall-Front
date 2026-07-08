/**
 * Domain types shared across services and the Vault store. `SessionKeys`
 * never leaves memory unencrypted except behind biometric-protected native
 * Secure_Store (see `src/vault/vaultStore.ts`).
 */
export interface SessionKeys {
  encryptionKey: Uint8Array;
  indexKey: Uint8Array;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Decrypted, in-memory-only representation of a superseded entry body. */
export interface PlainBodyVersion {
  id: string;
  body: string;
  changedAt: string;
  /** Set when decryption of this version failed; body may be empty. */
  decryptError?: boolean;
}

/** Decrypted, in-memory-only representation of an Entry. */
export interface PlainEntry {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** Set when decryption of this entry's fields failed; title/body may be partial/empty. */
  decryptError?: boolean;
}
