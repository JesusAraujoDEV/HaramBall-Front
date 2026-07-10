/**
 * Unit tests for the native libsodium wrapper's compatibility shims. The real
 * JSI module can't run under Jest, so `react-native-libsodium` is mocked; this
 * verifies the two translations the wrapper performs so encrypt/decrypt behave
 * like `libsodium-wrappers` (which the rest of the app targets).
 */
jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  ready: Promise.resolve(),
  crypto_pwhash: jest.fn(),
  crypto_pwhash_ALG_ARGON2ID13: 2,
  crypto_pwhash_SALTBYTES: 16,
  crypto_pwhash_OPSLIMIT_INTERACTIVE: 2,
  crypto_pwhash_MEMLIMIT_INTERACTIVE: 67108864,
  crypto_kdf_derive_from_key: jest.fn(),
  crypto_kdf_KEYBYTES: 32,
  crypto_kdf_CONTEXTBYTES: 8,
  crypto_aead_xchacha20poly1305_ietf_encrypt: jest.fn(() => new Uint8Array([1, 2, 3])),
  crypto_aead_xchacha20poly1305_ietf_decrypt: jest.fn(() => new Uint8Array([104, 105])), // "hi"
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: 24,
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES: 32,
  crypto_generichash: jest.fn(),
  crypto_generichash_KEYBYTES: 32,
  randombytes_buf: jest.fn(),
  to_base64: jest.fn(),
  from_base64: jest.fn(),
  to_string: jest.fn(() => 'hi'),
  base64_variants: { ORIGINAL: 1, URLSAFE_NO_PADDING: 7 },
}));

import * as rn from 'react-native-libsodium';
import sodium from './sodiumNative';

// Read the mocks back from the (mocked) module to avoid the TDZ that hoisted
// imports otherwise cause with closure-referenced mock variables.
const mockEncrypt = rn.crypto_aead_xchacha20poly1305_ietf_encrypt as jest.Mock;
const mockDecrypt = rn.crypto_aead_xchacha20poly1305_ietf_decrypt as jest.Mock;
const mockToString = rn.to_string as jest.Mock;

const nonce = new Uint8Array(24);
const key = new Uint8Array(32);

describe('native libsodium wrapper', () => {
  beforeEach(() => jest.clearAllMocks());

  it('encrypt: passes "" additional_data when the caller passes null', () => {
    sodium.crypto_aead_xchacha20poly1305_ietf_encrypt('hi', null, null, nonce, key, 'uint8array');
    expect(mockEncrypt).toHaveBeenCalledWith('hi', '', null, nonce, key, 'uint8array');
  });

  it('decrypt: passes "" additional_data and decodes the "text" format via to_string', () => {
    const result = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      new Uint8Array([9, 9]),
      null,
      nonce,
      key,
      'text',
    );
    expect(mockDecrypt).toHaveBeenCalledWith(null, new Uint8Array([9, 9]), '', nonce, key, 'uint8array');
    expect(mockToString).toHaveBeenCalled();
    expect(result).toBe('hi');
  });

  it('decrypt: returns raw bytes for the uint8array format', () => {
    const result = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      new Uint8Array([9, 9]),
      null,
      nonce,
      key,
      'uint8array',
    );
    expect(mockToString).not.toHaveBeenCalled();
    expect(result).toEqual(new Uint8Array([104, 105]));
  });
});
