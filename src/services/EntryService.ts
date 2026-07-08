import * as entriesApi from '../api/entries';
import type { EntryPayload } from '../api/entries';
import type { EntryResponse } from '../api/schemas';
import { NetworkError } from '../api/errors';
import { encrypt, decrypt } from '../crypto/cipher';
import { blindIndex, buildTitlePrefixIndex } from '../crypto/blindIndex';
import { parseEntryText, serializeEntryText } from '../utils/entryText';
import { getOfflineStore, isLocalId, LOCAL_ID_PREFIX } from '../offline/localDb';
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

/** Shapes a ciphertext payload as the `EntryResponse` row cached locally. */
function payloadToCachedEntry(id: string, payload: EntryPayload, createdAt: string): EntryResponse {
  return {
    id,
    titleCiphertext: payload.titleCiphertext,
    bodyCiphertext: payload.bodyCiphertext ?? null,
    tagsCiphertext: payload.tagsCiphertext ?? [],
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function newLocalId(): string {
  return `${LOCAL_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Orchestrates Entry CRUD: encrypts/decrypts content and builds/consumes
 * blind indexes around the API client (Requirements 6.1-6.4, 7.1, 7.2, 8.1,
 * 8.2, 8.4, 9.2). Stateless — receives `SessionKeys` from the Vault store on
 * every call so it stays unit-testable with real crypto + mocked API.
 *
 * Offline-first: reads fall back to the local ciphertext cache when the
 * network is unreachable; writes performed offline are applied to the cache
 * optimistically and queued in `sync_queue` for background sync (see
 * `src/offline/syncQueue.ts`).
 */
export const EntryService = {
  async list(keys: SessionKeys): Promise<PlainEntry[]> {
    const offline = getOfflineStore();
    try {
      const entries = await entriesApi.list();
      offline.replaceEntries(entries);
      return entries.map((e) => decryptEntry(e, keys));
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      return offline.getEntries().map((e) => decryptEntry(e, keys));
    }
  },

  async get(id: string, keys: SessionKeys): Promise<PlainEntry> {
    const offline = getOfflineStore();
    if (isLocalId(id)) {
      const cached = offline.getEntry(id);
      if (!cached) throw new NetworkError('Entry pending sync was not found locally');
      return decryptEntry(cached, keys);
    }
    try {
      const entry = await entriesApi.get(id);
      offline.upsertEntry(entry);
      return decryptEntry(entry, keys);
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      const cached = offline.getEntry(id);
      if (!cached) throw err;
      return decryptEntry(cached, keys);
    }
  },

  async create(title: string, body: string, tags: string[], keys: SessionKeys): Promise<PlainEntry> {
    const payload = buildPayload(title, body, tags, keys);
    const offline = getOfflineStore();
    const now = new Date().toISOString();
    try {
      const { id } = await entriesApi.create(payload);
      offline.upsertEntry(payloadToCachedEntry(id, payload, now));
      return { id, title, body, tags, createdAt: now, updatedAt: now };
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      const localId = newLocalId();
      offline.enqueue('create', localId, payload);
      offline.upsertEntry(payloadToCachedEntry(localId, payload, now));
      return { id: localId, title, body, tags, createdAt: now, updatedAt: now };
    }
  },

  async update(id: string, title: string, body: string, tags: string[], keys: SessionKeys): Promise<PlainEntry> {
    const payload = buildPayload(title, body, tags, keys);
    const offline = getOfflineStore();
    const now = new Date().toISOString();

    if (isLocalId(id)) {
      // The entry only exists in the pending-create queue item: replace its
      // payload in place so a single create carries the latest content.
      const pendingCreate = offline.getPendingOps().find((q) => q.op === 'create' && q.entryId === id);
      if (pendingCreate) {
        offline.updateQueuedPayload(pendingCreate.queueId, payload);
      } else {
        offline.enqueue('create', id, payload);
      }
      offline.upsertEntry(payloadToCachedEntry(id, payload, now));
      return { id, title, body, tags, createdAt: now, updatedAt: now };
    }

    try {
      const response = await entriesApi.update(id, payload);
      offline.upsertEntry(payloadToCachedEntry(id, payload, response.createdAt));
      return { id, title, body, tags, createdAt: response.createdAt, updatedAt: response.updatedAt };
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      offline.enqueue('update', id, payload);
      const cached = offline.getEntry(id);
      offline.upsertEntry(payloadToCachedEntry(id, payload, cached?.createdAt ?? now));
      return { id, title, body, tags, createdAt: cached?.createdAt ?? now, updatedAt: now };
    }
  },

  async remove(id: string): Promise<void> {
    const offline = getOfflineStore();

    if (isLocalId(id)) {
      // Never reached the server: drop the pending create and the cache row.
      for (const q of offline.getPendingOps()) {
        if (q.entryId === id) offline.deleteOp(q.queueId);
      }
      offline.removeEntry(id);
      return;
    }

    try {
      await entriesApi.remove(id);
      offline.removeEntry(id);
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      offline.enqueue('delete', id, null);
      offline.removeEntry(id);
    }
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
