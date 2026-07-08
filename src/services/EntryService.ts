import * as entriesApi from '../api/entries';
import type { EntryPayload } from '../api/entries';
import type { EntryResponse } from '../api/schemas';
import { encrypt, decrypt } from '../crypto/cipher';
import { blindIndex, buildTitlePrefixIndex } from '../crypto/blindIndex';
import { parseEntryText, serializeEntryText } from '../utils/entryText';
import type { PlainBodyVersion, PlainEntry, SessionKeys } from './types';

/**
 * Decrypts a backend `EntryResponse` into a `PlainEntry`. Never throws: a
 * per-entry decryption failure is surfaced via `decryptError` so one bad
 * entry can't crash the whole list (Requirement 7.3).
 */
function decryptEntry(entry: EntryResponse, keys: SessionKeys): PlainEntry {
  try {
    const title = decrypt(entry.titleCiphertext, keys.encryptionKey);
    const body = entry.bodyCiphertext ? decrypt(entry.bodyCiphertext, keys.encryptionKey) : '';
    const tags = entry.tagsCiphertext.map((t) => decrypt(t, keys.encryptionKey));
    return {
      id: entry.id,
      title,
      body,
      tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
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

function buildPayload(title: string, body: string, tags: string[], keys: SessionKeys): EntryPayload {
  return {
    titleCiphertext: encrypt(title, keys.encryptionKey),
    bodyCiphertext: body.length > 0 ? encrypt(body, keys.encryptionKey) : undefined,
    tagsCiphertext: tags.map((t) => encrypt(t, keys.encryptionKey)),
    titleBlindIndexes: buildTitlePrefixIndex(title, keys.indexKey),
    tagBlindIndexes: tags.map((t) => blindIndex(t, keys.indexKey)),
  };
}

/**
 * Orchestrates Entry CRUD: encrypts/decrypts content and builds/consumes
 * blind indexes around the API client (Requirements 6.1-6.4, 7.1, 7.2, 8.1,
 * 8.2, 8.4, 9.2). Stateless — receives `SessionKeys` from the Vault store on
 * every call so it stays unit-testable with real crypto + mocked API.
 */
export const EntryService = {
  async list(keys: SessionKeys): Promise<PlainEntry[]> {
    const entries = await entriesApi.list();
    return entries.map((e) => decryptEntry(e, keys));
  },

  async get(id: string, keys: SessionKeys): Promise<PlainEntry> {
    const entry = await entriesApi.get(id);
    return decryptEntry(entry, keys);
  },

  async create(title: string, body: string, tags: string[], keys: SessionKeys): Promise<PlainEntry> {
    const payload = buildPayload(title, body, tags, keys);
    const { id } = await entriesApi.create(payload);
    const now = new Date().toISOString();
    return { id, title, body, tags, createdAt: now, updatedAt: now };
  },

  async update(id: string, title: string, body: string, tags: string[], keys: SessionKeys): Promise<PlainEntry> {
    const payload = buildPayload(title, body, tags, keys);
    const response = await entriesApi.update(id, payload);
    return { id, title, body, tags, createdAt: response.createdAt, updatedAt: response.updatedAt };
  },

  async remove(id: string): Promise<void> {
    await entriesApi.remove(id);
  },

  async history(id: string, keys: SessionKeys): Promise<PlainBodyVersion[]> {
    const versions = await entriesApi.history(id);
    return versions.map((v) => {
      try {
        return { id: v.id, body: decrypt(v.bodyCiphertext, keys.encryptionKey), changedAt: v.changedAt };
      } catch {
        return { id: v.id, body: '', changedAt: v.changedAt, decryptError: true };
      }
    });
  },
};

export { parseEntryText, serializeEntryText };
export default EntryService;
