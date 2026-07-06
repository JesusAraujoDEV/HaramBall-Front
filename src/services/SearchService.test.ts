import sodium, { ready } from '../crypto/sodium';
import { encrypt } from '../crypto/cipher';
import { blindIndex } from '../crypto/blindIndex';
import * as searchApi from '../api/search';
import { SearchService } from './SearchService';
import type { SessionKeys } from './types';

jest.mock('../api/search');

beforeAll(async () => {
  await ready;
});

describe('SearchService', () => {
  let keys: SessionKeys;

  beforeEach(() => {
    jest.resetAllMocks();
    keys = { encryptionKey: sodium.randombytes_buf(32), indexKey: sodium.randombytes_buf(32) };
  });

  it('byTitle() normalizes and computes the blind index before calling the API', async () => {
    (searchApi.byTitle as jest.Mock).mockResolvedValue({ entries: [] });

    await SearchService.byTitle('  Bancámiga  ', keys);

    const expectedIndex = blindIndex('  Bancámiga  ', keys.indexKey); // blindIndex normalizes internally
    expect(searchApi.byTitle).toHaveBeenCalledWith(expectedIndex);
  });

  it('byTitle() decrypts returned entries', async () => {
    const title = encrypt('Bancamiga', keys.encryptionKey);
    (searchApi.byTitle as jest.Mock).mockResolvedValue({
      entries: [{ id: '1', titleCiphertext: title, bodyCiphertext: null, tagsCiphertext: [], createdAt: 'a', updatedAt: 'a' }],
    });

    const results = await SearchService.byTitle('banca', keys);
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Bancamiga');
  });

  it('byTitle() returns an empty array for an empty query without calling the API', async () => {
    const results = await SearchService.byTitle('   ', keys);
    expect(results).toEqual([]);
    expect(searchApi.byTitle).not.toHaveBeenCalled();
  });

  it('byTitle() returns an empty array (no throw) when the API returns no matches', async () => {
    (searchApi.byTitle as jest.Mock).mockResolvedValue({ entries: [] });
    const results = await SearchService.byTitle('nomatch', keys);
    expect(results).toEqual([]);
  });

  it('byTags() computes one blind index per tag', async () => {
    (searchApi.byTags as jest.Mock).mockResolvedValue({ entries: [] });

    await SearchService.byTags(['banca', 'vzla'], keys);

    expect(searchApi.byTags).toHaveBeenCalledWith(
      [blindIndex('banca', keys.indexKey), blindIndex('vzla', keys.indexKey)],
      'any',
    );
  });

  it('byTags() returns an empty array for no tags without calling the API', async () => {
    const results = await SearchService.byTags([], keys);
    expect(results).toEqual([]);
    expect(searchApi.byTags).not.toHaveBeenCalled();
  });

  it('byTags() passes through the match mode', async () => {
    (searchApi.byTags as jest.Mock).mockResolvedValue({ entries: [] });
    await SearchService.byTags(['banca'], keys, 'all');
    expect(searchApi.byTags).toHaveBeenCalledWith([blindIndex('banca', keys.indexKey)], 'all');
  });
});
