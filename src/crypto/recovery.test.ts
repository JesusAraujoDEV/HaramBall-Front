import sodium, { ready } from './sodium';
import { deriveSubkeys } from './kdf';
import { encrypt, decrypt } from './cipher';
import { DecryptionError } from './errors';
import {
  canonicalizeRecoveryCode,
  deriveRecoveryMaterial,
  generateRecoveryKey,
  generateVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
} from './recovery';
import { VAULT_KEY_BYTES } from './constants';

beforeAll(async () => {
  await ready;
});

describe('Recovery Kit crypto', () => {
  it('generates a 32-byte Vault Key', () => {
    expect(generateVaultKey()).toHaveLength(VAULT_KEY_BYTES);
  });

  it('generates a grouped recovery code with a canonical form', () => {
    const rk = generateRecoveryKey();
    expect(rk.code).toMatch(/^HB(-[A-Z2-7]{1,4})+$/);
    // Canonical is the separator-free uppercase form (HB + base32 payload).
    expect(rk.canonical).toBe(canonicalizeRecoveryCode(rk.code));
    expect(rk.canonical.startsWith('HB')).toBe(true);
  });

  it('canonicalizes user input regardless of case, spaces, or dashes', () => {
    const rk = generateRecoveryKey();
    const messy = rk.code.toLowerCase().replace(/-/g, ' ');
    expect(canonicalizeRecoveryCode(messy)).toBe(rk.canonical);
  });

  it('round-trips the Vault Key through wrap/unwrap with the password KEK', () => {
    const vaultKey = generateVaultKey();
    const wrapKey = sodium.randombytes_buf(32);
    const envelope = wrapVaultKey(vaultKey, wrapKey);
    expect(unwrapVaultKey(envelope, wrapKey)).toEqual(vaultKey);
  });

  it('rejects unwrapping with the wrong KEK', () => {
    const vaultKey = generateVaultKey();
    const envelope = wrapVaultKey(vaultKey, sodium.randombytes_buf(32));
    expect(() => unwrapVaultKey(envelope, sodium.randombytes_buf(32))).toThrow(DecryptionError);
  });

  it('recovers the SAME Vault Key from both the password and recovery paths', async () => {
    const vaultKey = generateVaultKey();
    const passwordWrapKey = sodium.randombytes_buf(32);

    const rk = generateRecoveryKey();
    const { wrapKey: recoveryWrapKey } = await deriveRecoveryMaterial(rk.canonical);

    const wrappedByPassword = wrapVaultKey(vaultKey, passwordWrapKey);
    const wrappedByRecovery = wrapVaultKey(vaultKey, recoveryWrapKey);

    // Both envelopes yield the identical Vault Key.
    expect(unwrapVaultKey(wrappedByPassword, passwordWrapKey)).toEqual(vaultKey);
    expect(unwrapVaultKey(wrappedByRecovery, recoveryWrapKey)).toEqual(vaultKey);

    // Re-deriving from the same code (as on a recovery attempt) matches.
    const reDerived = await deriveRecoveryMaterial(canonicalizeRecoveryCode(rk.code));
    expect(unwrapVaultKey(wrappedByRecovery, reDerived.wrapKey)).toEqual(vaultKey);
  });

  it('derives a stable recovery auth hash for the same code and different for another', async () => {
    const rk = generateRecoveryKey();
    const a = await deriveRecoveryMaterial(rk.canonical);
    const b = await deriveRecoveryMaterial(rk.canonical);
    const other = await deriveRecoveryMaterial(generateRecoveryKey().canonical);

    expect(a.recoveryAuthHash).toBe(b.recoveryAuthHash);
    expect(a.recoveryAuthHash).not.toBe(other.recoveryAuthHash);
  });

  it('data encrypted under the Vault Key survives a password change (rewrap only)', async () => {
    // The Vault Key encrypts data; changing the password only rewraps it.
    const vaultKey = generateVaultKey();
    const { encryptionKey } = deriveSubkeys(vaultKey);
    const secret = encrypt('super secret password', encryptionKey);

    // "Change password": derive a brand-new wrap KEK and rewrap the same VK.
    const newWrapKey = sodium.randombytes_buf(32);
    const rewrapped = wrapVaultKey(vaultKey, newWrapKey);
    const recoveredVaultKey = unwrapVaultKey(rewrapped, newWrapKey);

    // Same Vault Key → same data key → old ciphertext still decrypts.
    expect(decrypt(secret, deriveSubkeys(recoveredVaultKey).encryptionKey)).toBe('super secret password');
  });
});
