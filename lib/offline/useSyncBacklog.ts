import { useEffect, useMemo, useState } from 'react';

import type { CallTrackingInput } from '@/api/calls';
import { useLocalPatients } from '@/api/patients';
import type { LocalCall } from './callLedger';
import { getQueuedCallIds, subscribeOutbox } from './outbox';
import type { LocalPatient } from './patientOutbox';
import { useLocalCalls } from './useLocalCalls';

/**
 * - 'synced'   the server accepted this call's latest content.
 * - 'pending'  still queued; uploads on the next flush.
 * - 'rejected' the server refused it until the outbox gave up — it will never
 *              upload, so it must not sit under "pending" forever.
 */
export type CallSyncState = 'synced' | 'pending' | 'rejected';

export interface BacklogCall {
  id: string;
  call: CallTrackingInput;
  /** When the call happened: started, else cancelled, else first recorded. */
  at: Date;
  state: CallSyncState;
}

export interface SyncBacklog {
  /** Calls still waiting to upload, any day. */
  pendingCalls: number;
  rejectedCalls: number;
  /** Queued patients (not yet accepted by the server). */
  pendingPatients: LocalPatient[];
  /**
   * Every call this device holds that the server has NOT accepted — pending
   * and rejected alike — newest first. A call made online uploads immediately
   * and never appears here; this list is what offline work leaves behind.
   */
  unsyncedCalls: BacklogCall[];
  /** unsyncedCalls + pendingPatients — nothing left to sync when this is 0. */
  unsyncedTotal: number;
}

function callMoment(entry: LocalCall): Date {
  const { call } = entry;
  const stamp = Date.parse(
    call.call_start_time ?? call.call_cancel_time ?? call.arrived_time ?? '',
  );
  return new Date(Number.isFinite(stamp) ? stamp : entry.recordedAt);
}

/** Queued call ids, kept live as the outbox fills and drains. Null until read. */
function useQueuedCallIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = () => {
      void getQueuedCallIds()
        .then((next) => {
          if (mounted) setIds(next);
        })
        .catch(() => {});
    };

    load();
    const unsubscribe = subscribeOutbox(load);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return ids;
}

/**
 * What this device still owes the server, and the sync state of every call it
 * recorded today.
 *
 * Read from the call ledger rather than the outbox: the outbox deletes a row
 * the moment it uploads, so it can't list a synced call, and it holds one row
 * per call PHASE, so its count doubles every call made offline.
 *
 * `mieId` scopes the calls to the signed-in rep — the ledger is per device, and
 * a shared device keeps the previous rep's calls too.
 */
export function useSyncBacklog(mieId?: string): SyncBacklog {
  const local = useLocalCalls();
  const queued = useQueuedCallIds();
  const patients = useLocalPatients();

  return useMemo(() => {
    const calls: BacklogCall[] = local
      .filter((entry) => !mieId || String(entry.call.tsoid) === String(mieId))
      .map((entry) => {
        const id = entry.call.client_call_id;
        // Until the queue has been read, an unsynced call is assumed queued —
        // flashing "rejected" on open would be worse than a moment's optimism.
        const state: CallSyncState =
          entry.syncedAt != null
            ? 'synced'
            : !queued || queued.has(id)
              ? 'pending'
              : 'rejected';
        return { id, call: entry.call, at: callMoment(entry), state };
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime());

    const unsyncedCalls = calls.filter((c) => c.state !== 'synced');
    const pendingPatients = patients.filter((p) => p.syncedAt == null);

    return {
      pendingCalls: unsyncedCalls.filter((c) => c.state === 'pending').length,
      rejectedCalls: unsyncedCalls.filter((c) => c.state === 'rejected').length,
      pendingPatients,
      unsyncedCalls,
      unsyncedTotal: unsyncedCalls.length + pendingPatients.length,
    };
  }, [local, queued, patients, mieId]);
}
