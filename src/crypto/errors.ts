/**
 * Raised when decrypting a ciphertext envelope fails: either the
 * authentication tag doesn't verify (wrong key or tampered ciphertext) or
 * the envelope is malformed (bad version prefix, invalid base64, wrong
 * length). Never leaks the ciphertext or key in its message
 * (Requirements 5.4, 5.6, 15.1).
 */
export class DecryptionError extends Error {
  constructor(message = 'Failed to decrypt value') {
    super(message);
    this.name = 'DecryptionError';
  }
}
