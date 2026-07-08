import { Platform } from 'react-native';
import type { EntryResponse } from '../api/schemas';
import type { EntryPayload } from '../api/entries';

/**
 * Offline persistence for the vault, backed by SQLite on native and an
 * in-memory store on web/tests.
 *
 * SECURITY: only ciphertext ever touches this store. Cached rows hold the
 * exact XChaCha20-Poly1305 blobs the server stores (encrypted client-side
 * with the key derived from the user's session); the sync queue holds
 * ready-to-send ciphertext payloads. Nothing here can be read without the
 * session keys, satisfying encrypted-at-rest without a second crypto layer.
 */

export type SyncOp = 'create' | 'update' | 'delete';

export interface QueuedOp {
  queueId: number;
  op: SyncOp;
  /** Server entry id for update/delete; local temp id for create. */
  entryId: string;
  /** Ciphertext payload for create/update; null for delete. */
  payload: EntryPayload | null;
  createdAt: string;
}

export interface OfflineStore {
  /** Replaces the entire cached-entries snapshot (post-pull sync). */
  replaceEntries(entries: EntryResponse[]): void;
  getEntries(): EntryResponse[];
  getEntry(id: string): EntryResponse | null;
  upsertEntry(entry: EntryResponse): void;
  removeEntry(id: string): void;

  enqueue(op: SyncOp, entryId: string, payload: EntryPayload | null): void;
  getPendingOps(): QueuedOp[];
  /** Replaces the payload of a pending op (offline edit of an offline create). */
  updateQueuedPayload(queueId: number, payload: EntryPayload): void;
  deleteOp(queueId: number): void;

  /** Wipes cache and queue (logout). */
  clearAll(): void;
}

/** Prefix marking entries created offline that don't have a server id yet. */
export const LOCAL_ID_PREFIX = 'local-';

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

// ── In-memory implementation (web + Jest) ────────────────────────────────

function createMemoryStore(): OfflineStore {
  let entries = new Map<string, EntryResponse>();
  let queue: QueuedOp[] = [];
  let nextQueueId = 1;

  return {
    replaceEntries(next) {
      entries = new Map(next.map((e) => [e.id, e]));
    },
    getEntries() {
      return Array.from(entries.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getEntry(id) {
      return entries.get(id) ?? null;
    },
    upsertEntry(entry) {
      entries.set(entry.id, entry);
    },
    removeEntry(id) {
      entries.delete(id);
    },
    enqueue(op, entryId, payload) {
      queue.push({ queueId: nextQueueId++, op, entryId, payload, createdAt: new Date().toISOString() });
    },
    getPendingOps() {
      return [...queue];
    },
    updateQueuedPayload(queueId, payload) {
      const item = queue.find((q) => q.queueId === queueId);
      if (item) item.payload = payload;
    },
    deleteOp(queueId) {
      queue = queue.filter((q) => q.queueId !== queueId);
    },
    clearAll() {
      entries.clear();
      queue = [];
    },
  };
}

// ── SQLite implementation (native) ───────────────────────────────────────

interface SqliteRowEntry {
  id: string;
  title_ciphertext: string;
  body_ciphertext: string | null;
  tags_ciphertext: string;
  created_at: string;
  updated_at: string;
}

interface SqliteRowQueue {
  queue_id: number;
  op: string;
  entry_id: string;
  payload: string | null;
  created_at: string;
}

function rowToEntry(row: SqliteRowEntry): EntryResponse {
  return {
    id: row.id,
    titleCiphertext: row.title_ciphertext,
    bodyCiphertext: row.body_ciphertext,
    tagsCiphertext: JSON.parse(row.tags_ciphertext) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSqliteStore(): OfflineStore {
  // Lazy require so the native module never loads on web or under Jest.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const db = SQLite.openDatabaseSync('haramball-offline.db');

  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cached_entries (
      id TEXT PRIMARY KEY NOT NULL,
      title_ciphertext TEXT NOT NULL,
      body_ciphertext TEXT,
      tags_ciphertext TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
      op TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);

  return {
    replaceEntries(next) {
      db.withTransactionSync(() => {
        db.runSync('DELETE FROM cached_entries');
        for (const e of next) {
          db.runSync(
            `INSERT OR REPLACE INTO cached_entries
             (id, title_ciphertext, body_ciphertext, tags_ciphertext, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [e.id, e.titleCiphertext, e.bodyCiphertext, JSON.stringify(e.tagsCiphertext), e.createdAt, e.updatedAt],
          );
        }
      });
    },
    getEntries() {
      const rows = db.getAllSync<SqliteRowEntry>('SELECT * FROM cached_entries ORDER BY created_at DESC');
      return rows.map(rowToEntry);
    },
    getEntry(id) {
      const row = db.getFirstSync<SqliteRowEntry>('SELECT * FROM cached_entries WHERE id = ?', [id]);
      return row ? rowToEntry(row) : null;
    },
    upsertEntry(e) {
      db.runSync(
        `INSERT OR REPLACE INTO cached_entries
         (id, title_ciphertext, body_ciphertext, tags_ciphertext, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [e.id, e.titleCiphertext, e.bodyCiphertext, JSON.stringify(e.tagsCiphertext), e.createdAt, e.updatedAt],
      );
    },
    removeEntry(id) {
      db.runSync('DELETE FROM cached_entries WHERE id = ?', [id]);
    },
    enqueue(op, entryId, payload) {
      db.runSync(
        `INSERT INTO sync_queue (op, entry_id, payload, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
        [op, entryId, payload ? JSON.stringify(payload) : null, new Date().toISOString()],
      );
    },
    getPendingOps() {
      const rows = db.getAllSync<SqliteRowQueue>(
        `SELECT queue_id, op, entry_id, payload, created_at FROM sync_queue WHERE status = 'pending' ORDER BY queue_id ASC`,
      );
      return rows.map((r) => ({
        queueId: r.queue_id,
        op: r.op as SyncOp,
        entryId: r.entry_id,
        payload: r.payload ? (JSON.parse(r.payload) as EntryPayload) : null,
        createdAt: r.created_at,
      }));
    },
    updateQueuedPayload(queueId, payload) {
      db.runSync('UPDATE sync_queue SET payload = ? WHERE queue_id = ?', [JSON.stringify(payload), queueId]);
    },
    deleteOp(queueId) {
      db.runSync('DELETE FROM sync_queue WHERE queue_id = ?', [queueId]);
    },
    clearAll() {
      db.withTransactionSync(() => {
        db.runSync('DELETE FROM cached_entries');
        db.runSync('DELETE FROM sync_queue');
      });
    },
  };
}

// ── Platform selection (same pattern as `src/platform/secureStore.ts`) ────

let store: OfflineStore | null = null;

export function getOfflineStore(): OfflineStore {
  if (!store) {
    store = Platform.OS === 'web' ? createMemoryStore() : createSqliteStore();
  }
  return store;
}

/** Test-only: swap the store (e.g. for a fresh memory instance per test). */
export function __setOfflineStoreForTests(next: OfflineStore | null): void {
  store = next;
}

export default getOfflineStore;
