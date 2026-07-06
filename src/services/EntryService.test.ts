import sodium, { ready } from '../crypto/sodium';
import { decrypt } from '../crypto/cipher';
import { blindIndex, buildTitlePrefixIndex } from '../crypto/blindIndex';
import * as entriesApi from '../api/entries';
import { EntryService } from './EntryService';
import type { SessionKeys } from './types';

jest.mock('../api/entries');

beforeAll(async () => {
  await ready;
});

describe('EntryService', () => {
  let keys: SessionKeys;

  beforeEach(() => {
    jest.resetAllMocks();
    keys = {
      encryptionKey: sodium.randombytes_buf(32),
      indexKey: sodium.randombytes_buf(32),
    };
  });

  it('create() encrypts title/body/tags and sends the title prefix index + one blind index per tag', async () => {
    (entriesApi.create as jest.Mock).mockResolvedValue({ id: 'e1' });

    const entry = await EntryService.create('Bancamiga', 'user@x.com\nPASSWORD123', ['banca', 'vzla'], keys);

    expect(entriesApi.create).toHaveBeenCalledTimes(1);
    const payload = (entriesApi.create as jest.Mock).mock.calls[0][0];

    expect(decrypt(payload.titleCiphertext, keys.encryptionKey)).toBe('Bancamiga');
    expect(decrypt(payload.bodyCiphertext, keys.encryptionKey)).toBe('user@x.com\nPASSWORD123');
    expect(payload.tagsCiphertext.map((t: string) => decrypt(t, keys.encryptionKey))).toEqual(['banca', 'vzla']);

    const expectedTitleIndex = buildTitlePrefixIndex('Bancamiga', keys.indexKey);
    // Membership check: every prefix >= MIN_PREFIX of "Bancamiga" must be present.
    for (let k = 2; k <= 'bancamiga'.length; k += 1) {
      const prefixIdx = blindIndex('bancamiga'.slice(0, k), keys.indexKey);
      expect(payload.titleBlindIndexes).toContain(prefixIdx);
    }
    expect(new Set(payload.titleBlindIndexes).size).toBe(expectedTitleIndex.length);

    expect(payload.tagBlindIndexes).toEqual([
      blindIndex('banca', keys.indexKey),
      blindIndex('vzla', keys.indexKey),
    ]);

    expect(entry.id).toBe('e1');
    expect(entry.title).toBe('Bancamiga');
  });

  it('update() re-encrypts and rebuilds indexes', async () => {
    (entriesApi.update as jest.Mock).mockResolvedValue({
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });

    await EntryService.update('e1', 'NewTitle', 'newbody', ['x'], keys);

    const [id, payload] = (entriesApi.update as jest.Mock).mock.calls[0];
    expect(id).toBe('e1');
    expect(decrypt(payload.titleCiphertext, keys.encryptionKey)).toBe('NewTitle');
    expect(payload.tagBlindIndexes).toEqual([blindIndex('x', keys.indexKey)]);
  });

  it('remove() calls the API delete endpoint', async () => {
    (entriesApi.remove as jest.Mock).mockResolvedValue(undefined);
    await EntryService.remove('e1');
    expect(entriesApi.remove).toHaveBeenCalledWith('e1');
  });

  it('list() decrypts every entry', async () => {
    const title1 = require('../crypto/cipher').encrypt('First', keys.encryptionKey);
    const title2 = require('../crypto/cipher').encrypt('Second', keys.encryptionKey);
    (entriesApi.list as jest.Mock).mockResolvedValue([
      { id: '1', titleCiphertext: title1, bodyCiphertext: null, tagsCiphertext: [], createdAt: 'a', updatedAt: 'a' },
      { id: '2', titleCiphertext: title2, bodyCiphertext: null, tagsCiphertext: [], createdAt: 'b', updatedAt: 'b' },
    ]);

    const result = await EntryService.list(keys);
    expect(result.map((e) => e.title)).toEqual(['First', 'Second']);
  });

  it('list() surfaces a per-entry decryption failure without throwing for the whole list', async () => {
    const goodTitle = require('../crypto/cipher').encrypt('Good', keys.encryptionKey);
    const otherKeys: SessionKeys = { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) };
    const badTitle = require('../crypto/cipher').encrypt('Bad', otherKeys.encryptionKey); // wrong key on decrypt

    (entriesApi.list as jest.Mock).mockResolvedValue([
      { id: '1', titleCiphertext: goodTitle, bodyCiphertext: null, tagsCiphertext: [], createdAt: 'a', updatedAt: 'a' },
      { id: '2', titleCiphertext: badTitle, bodyCiphertext: null, tagsCiphertext: [], createdAt: 'b', updatedAt: 'b' },
    ]);

    const result = await EntryService.list(keys);
    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('Good');
    expect(result[0]?.decryptError).toBeUndefined();
    expect(result[1]?.decryptError).toBe(true);
  });

  it('get() decrypts a single entry', async () => {
    const title = require('../crypto/cipher').encrypt('Solo', keys.encryptionKey);
    (entriesApi.get as jest.Mock).mockResolvedValue({
      id: '1',
      titleCiphertext: title,
      bodyCiphertext: null,
      tagsCiphertext: [],
      createdAt: 'a',
      updatedAt: 'a',
    });

    const entry = await EntryService.get('1', keys);
    expect(entry.title).toBe('Solo');
  });
});
