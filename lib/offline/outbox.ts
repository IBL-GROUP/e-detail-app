import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';

import {
  postCallsBatch,
  type BatchCallItem,
  type CallTrackingInput,
} from '@/api/calls';
import {
  openOutbox,
  dbInsert,
  dbCount,
  dbGetBatch,
  dbDelete,
  dbUpdateFailed,
} from './outboxStore';
import { initCallLedger, markLocalCallSynced, recordLocalCall } from './callLedger';

/**
 * A durable, offline-first write queue for call activity. Every completed call
 * is written here FIRST (even when online), then flushed to the backend. If the
 * device is offline the row simply waits; a flush is retried on reconnect, on
 * app start, and after each enqueue. This guarantees no call is ever lost.
 *
 * Storage is platform-split: expo-sqlite on native, localStorage on web (see
 * outboxStore.ts / outboxStore.web.ts).
 */

// Flush at most this many rows per batch request.
const FLUSH_BATCH_SIZE = 50;
// A call the server keeps REJECTING (e.g. an invalid/stale doctor id) is dropped
// after this many attempts so it can't block the queue forever. Transient
// network failures do NOT count toward this cap — data is only given up when the
// server explicitly rejected the content.
const MAX_REJECT_ATTEMPTS = 5;

let isFlushing = false;
// A flush asked for while one was already running. Dropping it left the call
// that triggered it queued until the next reconnect or app start — long enough
// for the rep to look at the analytics and not find their call there.
let isFlushPending = false;
const listeners = new Set<() => void>();
const syncedListeners = new Set<() => void>();

/** Initialize the store early (called at app start). */
export async function initOutbox(): Promise<void> {
  await openOutbox();
  await initCallLedger();
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

function notifySynced() {
  syncedListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

/** Subscribe to queue changes (e.g. to show a pending badge). Returns unsubscribe. */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Subscribe to calls actually LANDING on the server (at least one row accepted
 * by a flush). Everything derived from call_tracking — the doctor's month
 * summary, the completed list, the monthly totals — is stale the moment this
 * fires, so this is what tells the app to refetch. Returns unsubscribe.
 */
export function subscribeOutboxSynced(listener: () => void): () => void {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

/** Count of calls still waiting to sync. */
export async function getPendingCount(): Promise<number> {
  return dbCount();
}

/**
 * Queue one completed call. Writes locally, then kicks off a best-effort flush
 * (which is a no-op when offline). Resolves once the row is persisted, so the
 * UI can proceed immediately regardless of connectivity.
 */
export async function enqueueCall(payload: CallTrackingInput): Promise<string> {
  const clientId = Crypto.randomUUID();
  await dbInsert(clientId, JSON.stringify(payload), new Date().toISOString());
  // Also record it in the durable ledger: the outbox row disappears on upload,
  // but the screens still have to report this call for the rest of the month.
  await recordLocalCall(payload);
  notify();
  // Fire-and-forget; never block the caller on the network.
  void flushOutbox();
  return clientId;
}

/**
 * Push queued calls to the backend. Safe to call anytime: it does nothing when
 * offline or empty. Successfully synced rows are removed; failures keep their
 * row (attempts incremented) to retry later. A call made WHILE a flush is
 * running doesn't lose its flush — it is replayed once the current one ends.
 */
export async function flushOutbox(): Promise<void> {
  if (isFlushing) {
    isFlushPending = true;
    return;
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  isFlushing = true;
  try {
    // Retry oldest first, in bounded batches.
    const rows = await dbGetBatch(FLUSH_BATCH_SIZE);
    if (rows.length === 0) return;

    const items: BatchCallItem[] = rows.map((row) => ({
      ...(JSON.parse(row.payload) as CallTrackingInput),
      clientId: row.client_id,
    }));

    let response;
    try {
      response = await postCallsBatch(items);
    } catch (error: any) {
      // Network/server failure: bump attempts, keep rows for the next retry.
      const message = String(error?.message ?? 'flush failed').slice(0, 500);
      for (const row of rows) {
        await dbUpdateFailed(row.client_id, row.attempts + 1, message);
      }
      notify();
      return;
    }

    const attemptsByClientId = new Map(rows.map((row) => [row.client_id, row.attempts]));
    // The outbox row id and the call's own client_call_id are different keys —
    // map one to the other so an accepted row can be marked synced in the ledger.
    const callIdByClientId = new Map(
      items.map((item) => [item.clientId, item.client_call_id]),
    );
    let syncedCount = 0;
    for (const result of response.results) {
      if (!result.clientId) continue;
      if (result.success) {
        syncedCount += 1;
        await dbDelete(result.clientId);
        const clientCallId = callIdByClientId.get(result.clientId);
        if (clientCallId) await markLocalCallSynced(clientCallId);
      } else {
        const nextAttempts = (attemptsByClientId.get(result.clientId) ?? 0) + 1;
        if (nextAttempts >= MAX_REJECT_ATTEMPTS) {
          // Permanently rejected by the server — give up so it can't wedge the queue.
          console.warn(
            `[outbox] dropping call ${result.clientId} after ${nextAttempts} rejections: ${result.message}`,
          );
          await dbDelete(result.clientId);
        } else {
          await dbUpdateFailed(
            result.clientId,
            nextAttempts,
            String(result.message ?? 'rejected').slice(0, 500),
          );
        }
      }
    }
    notify();
    // The server now holds calls it didn't a moment ago — anything read from
    // call_tracking has to be refetched.
    if (syncedCount > 0) notifySynced();

    // If a full batch synced, there may be more queued — keep draining.
    if (rows.length === FLUSH_BATCH_SIZE) {
      isFlushing = false;
      isFlushPending = false;
      await flushOutbox();
      return;
    }
  } finally {
    isFlushing = false;
  }

  // A call queued mid-flush missed this pass — run it now rather than leaving
  // it for the next reconnect.
  if (isFlushPending) {
    isFlushPending = false;
    await flushOutbox();
  }
}
