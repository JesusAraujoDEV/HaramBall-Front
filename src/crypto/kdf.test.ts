import { ready } from './sodium';
import { deriveMasterKey, deriveSubkeys } from './kdf';

beforeAll(async () => {
  await ready;
});

describe('kdf', () => {
  it('deriveMasterKey is deterministic for the same password + email', async () => {
    const key1 = await deriveMasterKey('correct horse battery staple!', 'user@example.com');
    const key2 = await deriveMasterKey('correct horse battery staple!', 'user@example.com');
    expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
  });

  it('deriveMasterKey normalizes email before salting (case/whitespace insensitive)', async () => {
    const key1 = await deriveMasterKey('correct horse battery staple!', 'user@example.com');
    const key2 = await deriveMasterKey('correct horse battery staple!', '  User@Example.com  ');
    expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
  });

  it('deriveMasterKey differs for different passwords', async () => {
    const key1 = await deriveMasterKey('password-one-12345', 'user@example.com');
    const key2 = await deriveMasterKey('password-two-12345', 'user@example.com');
    expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
  });

  it('deriveMasterKey differs for different emails (different salt)', async () => {
    const key1 = await deriveMasterKey('correct horse battery staple!', 'a@example.com');
    const key2 = await deriveMasterKey('correct horse battery staple!', 'b@example.com');
    expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
  });

  it('Property 7: key isolation — encryptionKey, indexKey, authHash are pairwise distinct', async () => {
    const masterKey = await deriveMasterKey('correct horse battery staple!', 'user@example.com');
    const { encryptionKey, indexKey, authHash } = deriveSubkeys(masterKey);

    const encHex = Buffer.from(encryptionKey).toString('hex');
    const idxHex = Buffer.from(indexKey).toString('hex');

    expect(encHex).not.toBe(idxHex);
    expect(encHex).not.toBe(authHash);
    expect(idxHex).not.toBe(authHash);
  });

  it('deriveSubkeys is deterministic given the same Master_Key', async () => {
    const masterKey = await deriveMasterKey('correct horse battery staple!', 'user@example.com');
    const subkeys1 = deriveSubkeys(masterKey);
    const subkeys2 = deriveSubkeys(masterKey);

    expect(Buffer.from(subkeys1.encryptionKey).toString('hex')).toBe(
      Buffer.from(subkeys2.encryptionKey).toString('hex'),
    );
    expect(Buffer.from(subkeys1.indexKey).toString('hex')).toBe(
      Buffer.from(subkeys2.indexKey).toString('hex'),
    );
    expect(subkeys1.authHash).toBe(subkeys2.authHash);
  });

  it('deriveSubkeys produces 32-byte encryption and index keys', async () => {
    const masterKey = await deriveMasterKey('correct horse battery staple!', 'user@example.com');
    const { encryptionKey, indexKey } = deriveSubkeys(masterKey);
    expect(encryptionKey).toHaveLength(32);
    expect(indexKey).toHaveLength(32);
  });

  it('known-answer vector: fixed password/email derive a fixed Master_Key and subkeys', async () => {
    const masterKey = await deriveMasterKey('KnownAnswerTestPassword123!', 'kat@haramball.test');
    expect(Buffer.from(masterKey).toString('base64')).toMatchSnapshot('master-key');

    const { encryptionKey, indexKey, authHash } = deriveSubkeys(masterKey);
    expect(Buffer.from(encryptionKey).toString('base64')).toMatchSnapshot('encryption-key');
    expect(Buffer.from(indexKey).toString('base64')).toMatchSnapshot('index-key');
    expect(authHash).toMatchSnapshot('auth-hash');
  });
});
