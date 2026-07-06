import * as searchApi from '../api/search';
import type { EntryResponse } from '../api/schemas';
import { decrypt } from '../crypto/cipher';
import { blindIndex } from '../crypto/blindIndex';
import type { PlainEntry, SessionKeys } from './types';

function decryptEntry(entry: EntryResponse, keys: SessionKeys): PlainEntry {
  try {
    const title = decrypt(entry.titleCiphertext, keys.encryptionKey);
    const body = entry.bodyCiphertext ? decrypt(entry.bodyCiphertext, keys.encryptionKey) : '';
    const tags = entry.tagsCiphertext.map((t) => decrypt(t, keys.encryptionKey));
    return { id: entry.id, title, body, tags, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
  } catch {
    return {
      id: entry.id,
      title: '',
      body: '',
      tags: [],
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      decryptError: true,
    };
  }
}

/**
 * Chat-style search: normalizes the query and computes its blind index
 * before calling the Backend, then decrypts results (Requirements 10.1,
 * 10.2, 10.3, 11.1, 11.2). Normalization happens inside `blindIndex` itself
 * (see `src/crypto/blindIndex.ts`), so callers only need to pass raw text.
 */
export const SearchService = {
  async byTitle(query: string, keys: SessionKeys): Promise<PlainEntry[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const index = blindIndex(trimmed, keys.indexKey);
    const { entries } = await searchApi.byTitle(index);
    return entries.map((e) => decryptEntry(e, keys));
  },

  async byTags(tags: string[], keys: SessionKeys, match: 'any' | 'all' = 'any'): Promise<PlainEntry[]> {
    if (tags.length === 0) {
      return [];
    }
    const indexes = tags.map((t) => blindIndex(t, keys.indexKey));
    const { entries } = await searchApi.byTags(indexes, match);
    return entries.map((e) => decryptEntry(e, keys));
  },
};

export default SearchService;
