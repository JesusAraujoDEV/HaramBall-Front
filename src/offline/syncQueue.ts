import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
import * as entriesApi from '../api/entries';
import { ApiError, NetworkError } from '../api/errors';
import { getOfflineStore } from './localDb';
import { logger } from '../utils/logger';

/**
 * Background sync: drains the offline `sync_queue` sequentially (FIFO)
 * against the backend as soon as connectivity returns.
 *
 * The queue holds ready-to-send ciphertext payloads, so no session keys are
 * needed to sync — it works even while the vault is locked. After a
 * successful drain the cache is refreshed with a full pull and the entry
 * queries are invalidated so the UI swaps temp local ids for server ids.
 */

let processing = false;

export async function processSyncQueue(queryClient?: QueryClient): Promise<void> {
  if (processing) return;
  processing = true;

  const offline = getOfflineStore();
  let synced = 0;

  try {
    for (const op of offline.getPendingOps()) {
      try {
        if (op.op === 'create' && op.payload) {
          await entriesApi.create(op.payload);
        } else if (op.op === 'update' && op.payload) {
          await entriesApi.update(op.entryId, op.payload);
        } else if (op.op === 'delete') {
          await entriesApi.remove(op.entryId);
        }
        offline.deleteOp(op.queueId);
        synced += 1;
      } catch (err) {
        if (err instanceof NetworkError) {
          // Still (or again) offline: stop and retry on the next connection.
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          // The target no longer exists server-side; the op is moot.
          offline.deleteOp(op.queueId);
          continue;
        }
        // Auth/validation errors: drop out and let the next trigger retry;
        // keeping the op preserves the user's change for a later session.
        logger.warn('sync_queue op failed; will retry on next connection');
        return;
      }
    }

    if (synced > 0) {
      try {
        const entries = await entriesApi.list();
        offline.replaceEntries(entries);
        await queryClient?.invalidateQueries({ queryKey: ['entries'] });
      } catch {
        // Refresh is best-effort; the next list() call reconciles.
      }
    }
  } finally {
    processing = false;
  }
}

/**
 * Starts the connectivity listener that triggers a queue drain whenever the
 * device (re)gains internet. Also fires one initial drain at startup.
 * Returns an unsubscribe function (call on app teardown).
 */
export function startNetworkSync(queryClient?: QueryClient): () => void {
  void processSyncQueue(queryClient);

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void processSyncQueue(queryClient);
    }
  });

  return unsubscribe;
}
