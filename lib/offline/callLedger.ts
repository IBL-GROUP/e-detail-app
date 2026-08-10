import type { CallTrackingInput } from '@/api/calls';
import {
  ledgerAll,
  ledgerMarkSynced,
  ledgerPrune,
  ledgerWrite,
  openLedger,
} from './callLedgerStore';
import type { CallLedgerRow } from './callLedgerTypes';

/**
 * The durable local record of every call this device has made.
 *
 * The outbox answers "what still needs uploading"; the ledger answers "what has
 * this rep done", which is what every screen actually shows. Rows survive the
 * upload, so a call made offline keeps counting toward the month's figures
 * whether or not it has reached the server yet.
 */

// Calls older than this are dropped once synced — the app only ever reports on
// the current month, and a couple of months of history is plenty of slack.
const RETAIN_DAYS = 90;

const listeners = new Set<() => void>();

// Every screen that shows a call figure reads the ledger, so the parsed rows are
// cached and shared. Cleared on any write, which is the only thing that can
// change them.
let snapshot: LocalCall[] | null = null;
let loading: Promise<LocalCall[]> | null = null;

function notify() {
  snapshot = null;
  loading = null;

  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

/** Subscribe to ledger changes. Returns unsubscribe. */
export function subscribeCallLedger(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initCallLedger(): Promise<void> {
  await openLedger();
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000);
  try {
    await ledgerPrune(cutoff.toISOString());
  } catch {
    // pruning is housekeeping — never block startup on it
  }
}

/**
 * Record a call locally. Called for BOTH phases: the 'started' payload writes
 * the row and the 'completed' payload replaces it, mirroring the server's
 * upsert on client_call_id. A late 'started' can never regress a call already
 * completed here, exactly as the server guards it.
 */
export async function recordLocalCall(payload: CallTrackingInput): Promise<void> {
  const clientCallId = payload?.client_call_id;
  if (!clientCallId) return;

  try {
    const existing = (await ledgerAll()).find(
      (row) => row.client_call_id === clientCallId,
    );
    const previous = existing ? parseLedgerRow(existing) : null;

    // Merge onto the previous phase so a slim payload never drops fields the
    // earlier one carried, and keep 'completed' once reached.
    const merged: CallTrackingInput = {
      ...(previous ?? {}),
      ...payload,
      call_outcome:
        previous?.call_outcome === 'completed'
          ? 'completed'
          : payload.call_outcome,
    };

    await ledgerWrite(
      clientCallId,
      JSON.stringify(merged),
      existing?.recorded_at ?? new Date().toISOString(),
    );
    notify();
  } catch (error) {
    console.warn('[ledger] failed to record call locally', error);
  }
}

/** The server has accepted this call's current content. */
export async function markLocalCallSynced(clientCallId: string): Promise<void> {
  if (!clientCallId) return;
  try {
    await ledgerMarkSynced(clientCallId, new Date().toISOString());
    notify();
  } catch (error) {
    console.warn('[ledger] failed to mark call synced', error);
  }
}

/** One ledger row with its payload parsed, or null when unreadable. */
function parseLedgerRow(row: CallLedgerRow): CallTrackingInput | null {
  try {
    return JSON.parse(row.payload) as CallTrackingInput;
  } catch {
    return null;
  }
}

/** A locally recorded call, paired with when the server accepted it. */
export interface LocalCall {
  call: CallTrackingInput;
  /** Epoch ms the server accepted this content, or null while still local. */
  syncedAt: number | null;
  recordedAt: number;
}

export async function getLocalCalls(): Promise<LocalCall[]> {
  if (snapshot) return snapshot;

  if (!loading) {
    loading = (async () => {
      try {
        const rows = await ledgerAll();
        const parsed = rows
          .map((row) => {
            const call = parseLedgerRow(row);
            if (!call) return null;
            return {
              call,
              syncedAt: row.synced_at ? Date.parse(row.synced_at) : null,
              recordedAt: Date.parse(row.recorded_at),
            } satisfies LocalCall;
          })
          .filter((entry): entry is LocalCall => entry !== null);
        snapshot = parsed;
        return parsed;
      } catch (error) {
        console.warn('[ledger] failed to read local calls', error);
        return [];
      } finally {
        loading = null;
      }
    })();
  }

  return loading;
}
