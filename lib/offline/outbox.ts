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
 * Doctor ids of calls still queued locally (recorded offline, not yet synced to
 * call_tracking). Lets the Completed tab include just-made offline calls.
 */
export async function getPendingCallDoctorIds(): Promise<string[]> {
  const rows = await dbGetBatch(1000);
  const ids = new Set<string>();
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as { doctorid?: string };
      if (payload.doctorid) ids.add(String(payload.doctorid));
    } catch {
      // skip unparseable rows
    }
  }
  return [...ids];
}

/**
 * Queue one completed call. Writes locally, then kicks off a best-effort flush
 * (which is a no-op when offline). Resolves once the row is persisted, so the
 * UI can proceed immediately regardless of connectivity.
 */
export async function enqueueCall(payload: CallTrackingInput): Promise<string> {
  const clientId = Crypto.randomUUID();
  await dbInsert(clientId, JSON.stringify(payload), new Date().toISOString());
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
    let syncedCount = 0;
    for (const result of response.results) {
      if (!result.clientId) continue;
      if (result.success) {
        syncedCount += 1;
        await dbDelete(result.clientId);
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
