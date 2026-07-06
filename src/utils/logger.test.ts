import fc from 'fast-check';
import sodium, { ready } from '../crypto/sodium';
import { encrypt } from '../crypto/cipher';
import { blindIndex } from '../crypto/blindIndex';
import { logger } from './logger';

beforeAll(async () => {
  await ready;
});

/**
 * Property 10: No secret in logs — log/crash output excludes secrets,
 * ciphertext, and blind-index inputs (Requirements 5.6, 15.1).
 */
describe('logger (Property 10: no secret in logs)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('redacts a ciphertext envelope string', () => {
    const key = sodium.randombytes_buf(32);
    const envelope = encrypt('super secret body text', key);
    logger.log('entry ciphertext:', envelope);

    const output = logSpy.mock.calls[0]?.join(' ') ?? '';
    expect(output).not.toContain(envelope);
  });

  it('redacts a blind index string', () => {
    const key = sodium.randombytes_buf(32);
    const index = blindIndex('bancamiga', key);
    logger.log('title index:', index);

    const output = logSpy.mock.calls[0]?.join(' ') ?? '';
    expect(output).not.toContain(index);
  });

  it('redacts sensitive object keys regardless of value shape', () => {
    logger.log('login attempt', {
      email: 'user@example.com',
      password: 'hunter2',
      masterKey: 'deadbeef',
      accessToken: 'abc.def.ghi',
    });

    const output = JSON.stringify(logSpy.mock.calls[0]);
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('deadbeef');
    expect(output).not.toContain('abc.def.ghi');
    // Non-sensitive fields still come through for debugging usefulness.
    expect(output).toContain('user@example.com');
  });

  it('redacts raw Uint8Array key material', () => {
    const key = sodium.randombytes_buf(32);
    logger.log('key bytes', key);
    const output = JSON.stringify(logSpy.mock.calls[0]);
    expect(output).toContain('REDACTED');
  });

  it('property: any envelope produced by encrypt() never appears verbatim in scrubbed log output', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const key = sodium.randombytes_buf(32);
        const envelope = encrypt(message, key);
        logSpy.mockClear();
        logger.log('payload', { titleCiphertext: envelope });
        const output = JSON.stringify(logSpy.mock.calls[0]);
        expect(output).not.toContain(envelope);
      }),
      { numRuns: 50 },
    );
  });

  it('redacts an Error message that itself contains an envelope-shaped string', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const key = sodium.randombytes_buf(32);
    const envelope = encrypt('secret', key);
    logger.error(new Error(`Decryption failed for ${envelope}`));
    const output = JSON.stringify(errorSpy.mock.calls[0] ?? []);
    expect(output).not.toContain(envelope);
    errorSpy.mockRestore();
  });
});
