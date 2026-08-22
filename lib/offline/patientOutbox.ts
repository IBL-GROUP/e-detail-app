import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';

import axios from '@/config/axios';
import {
  cleanUpLocalAttachments,
  isLocalAttachment,
  persistPickedImage,
  uploadPendingAttachments,
} from './patientAttachments';
// Type-only: erased at compile time, so this file has no runtime dependency on
// the api module — which imports THIS one. The call queue keeps the same
// one-way shape (api/calls.ts never imports lib/offline/outbox.ts).
import type { PatientLogInput } from '@/api/patients';
import {
  openPatientOutbox,
  patientAll,
  patientDelete,
  patientMarkFailed,
  patientMarkSynced,
  patientPending,
  patientPendingCount,
  patientPrune,
  patientWrite,
} from './patientOutboxStore';

/**
 * A durable, offline-first write queue for the patient log — the same guarantee
 * the call outbox gives, applied to patient_log.
 *
 * Every patient is written to the device FIRST (even when online) and only then
 * flushed to the backend, so recording one never depends on having signal. The
 * server upserts on client_patient_id, so a retried flush updates the row it
 * already wrote instead of filing the patient twice.
 *
 * Unlike calls, a synced row is KEPT rather than deleted: the list renders local
 * rows alongside the server's, and dropping one the moment it uploaded would
 * make the patient disappear until the next refetch brought them back.
 */

// Flush at most this many rows per batch request.
const FLUSH_BATCH_SIZE = 50;
// A patient the server keeps REJECTING is dropped after this many attempts so
// it can't block the queue forever. Transient network failures do NOT count —
// data is only given up when the server explicitly rejected the content.
const MAX_REJECT_ATTEMPTS = 5;
// Synced patients older than this are dropped from the device. The list reads
// from the server beyond that horizon.
const RETAIN_DAYS = 90;

export interface BatchPatientResult {
  clientId: string | null;
  success: boolean;
  sNo?: number | null;
  message?: string;
}

export interface BatchPatientResponse {
  success: boolean;
  count: number;
  results: BatchPatientResult[];
}

/** Flush a batch of queued patients; returns per-item results (partial ok). */
async function postPatientsBatch(
  patients: (PatientLogInput & { clientId: string })[],
): Promise<BatchPatientResponse> {
  return axios.post('/patients/batch', {
    patients,
  }) as unknown as Promise<BatchPatientResponse>;
}

let isFlushing = false;
// A flush asked for while one was already running, replayed once it ends.
let isFlushPending = false;

const listeners = new Set<() => void>();

// Parsed rows are cached and shared — every screen showing a patient reads
// them. Cleared on any write, the only thing that can change them.
let snapshot: LocalPatient[] | null = null;
let loading: Promise<LocalPatient[]> | null = null;

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

/** Subscribe to queue changes (a patient recorded, or one accepted). */
export function subscribePatientOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Initialize the store early (called at app start). */
export async function initPatientOutbox(): Promise<void> {
  await openPatientOutbox();
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000);
  try {
    await patientPrune(cutoff.toISOString());
  } catch {
    // pruning is housekeeping — never block startup on it
  }
}

/** Patients still waiting to reach the server. */
export async function getPendingPatientCount(): Promise<number> {
  return patientPendingCount();
}

/** A patient recorded on this device, with its sync state. */
export interface LocalPatient {
  clientPatientId: string;
  patient: PatientLogInput;
  /** ISO timestamp the server accepted it, or null while still local. */
  syncedAt: string | null;
  recordedAt: string;
}

/**
 * Queue one patient. Writes locally, then kicks off a best-effort flush (a
 * no-op when offline). Resolves once the row is on disk, so the form can close
 * immediately regardless of connectivity.
 */
export async function enqueuePatient(
  payload: PatientLogInput,
): Promise<string> {
  /**
   * Identity decides insert vs update, and getting it wrong duplicates the
   * patient:
   *
   * - Editing a row this app filed  -> reuse its client_patient_id, so the
   *   server's upsert lands on the same row.
   * - Editing a row with no client id (filed before that column existed) ->
   *   send NO client id at all and let the server match on s_no. Minting one
   *   here would make the upsert find nothing and insert a second copy.
   * - A genuinely new patient -> a fresh id.
   */
  const clientPatientId =
    payload.client_patient_id ??
    (payload.s_no != null ? undefined : Crypto.randomUUID());

  // The local queue still needs a unique key for a row that has no client id.
  const queueKey = clientPatientId ?? `s_no:${payload.s_no}`;

  // Picked images live in the OS cache directory, which can be cleared at any
  // time. Copy them somewhere durable BEFORE the row is queued, so a photo can't
  // evaporate between the clinic and the next flush.
  const attachments: string[] = [];
  for (const uri of payload.attachments ?? []) {
    const value = String(uri ?? '').trim();
    if (!value) continue;
    attachments.push(isLocalAttachment(value) ? await persistPickedImage(value) : value);
  }

  await patientWrite(
    queueKey,
    JSON.stringify({
      ...payload,
      attachments,
      // Only ever set when there genuinely is one — an `undefined` here would
      // serialize away, which is exactly what the s_no path needs.
      client_patient_id: clientPatientId,
    }),
    new Date().toISOString(),
  );
  notify();
  // Fire-and-forget; never block the caller on the network.
  void flushPatientOutbox();
  return queueKey;
}

function parseRow(payload: string): PatientLogInput | null {
  try {
    return JSON.parse(payload) as PatientLogInput;
  } catch {
    return null;
  }
}

/** Every patient this device has recorded, newest first. */
export async function getLocalPatients(): Promise<LocalPatient[]> {
  if (snapshot) return snapshot;

  if (!loading) {
    loading = (async () => {
      try {
        const rows = await patientAll();
        const parsed = rows
          .map((row) => {
            const patient = parseRow(row.payload);
            if (!patient) return null;
            return {
              clientPatientId: row.client_patient_id,
              patient,
              syncedAt: row.synced_at,
              recordedAt: row.recorded_at,
            } satisfies LocalPatient;
          })
          .filter((entry): entry is LocalPatient => entry !== null);
        snapshot = parsed;
        return parsed;
      } catch (error) {
        console.warn('[patients] failed to read local patients', error);
        return [];
      } finally {
        loading = null;
      }
    })();
  }

  return loading;
}

/**
 * Push queued patients to the backend. Safe to call anytime: it does nothing
 * when offline or empty. Accepted rows are marked synced (not deleted);
 * failures keep their row, with attempts incremented, to retry later.
 *
 * Returns how many rows the server accepted, so callers can decide whether
 * anything downstream needs refetching.
 */
export async function flushPatientOutbox(): Promise<number> {
  if (isFlushing) {
    isFlushPending = true;
    return 0;
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected) return 0;

  let syncedCount = 0;
  isFlushing = true;

  try {
    const rows = await patientPending(FLUSH_BATCH_SIZE);
    if (rows.length === 0) return 0;

    // A row whose payload won't parse can never be sent — sending it as an
    // empty object would just be rejected five times and then dropped anyway.
    // Discard it here so it can't hold up the rows behind it.
    const items: (PatientLogInput & { clientId: string })[] = [];
    const uploadFailures: string[] = [];
    // The on-device image files per row, kept so they can be deleted once the
    // server has accepted the patient that referenced them.
    const localFilesById = new Map<string, string[]>();

    for (const row of rows) {
      const patient = parseRow(row.payload);
      if (!patient) {
        console.warn(
          `[patients] dropping unreadable queued patient ${row.client_patient_id}`,
        );
        await patientDelete(row.client_patient_id);
        continue;
      }

      /**
       * Images go up FIRST, and the patient carries the server paths they came
       * back as. If any upload fails the whole row is held over rather than
       * filed with a short list — a prescription photo that silently never
       * arrived is worse than a patient that syncs an hour later.
       */
      let attachments: string[];
      try {
        attachments = await uploadPendingAttachments(patient.attachments);
      } catch (error: any) {
        uploadFailures.push(row.client_patient_id);
        await patientMarkFailed(
          row.client_patient_id,
          row.attempts,
          String(error?.message ?? 'attachment upload failed').slice(0, 500),
        );
        continue;
      }

      localFilesById.set(
        row.client_patient_id,
        (patient.attachments ?? []).filter(isLocalAttachment),
      );
      items.push({ ...patient, attachments, clientId: row.client_patient_id });
    }

    if (uploadFailures.length > 0) {
      console.warn(
        `[patients] holding ${uploadFailures.length} row(s) — attachments not uploaded yet`,
      );
      notify();
    }

    if (items.length === 0) {
      notify();
      return 0;
    }

    const attemptsById = new Map(
      rows.map((row) => [row.client_patient_id, row.attempts]),
    );

    let response;
    try {
      response = await postPatientsBatch(items);
    } catch (error: any) {
      // Network/server failure: keep every row for the next retry, and record
      // why. `attempts` is deliberately left ALONE — it counts explicit
      // rejections only, so a fortnight in the field with no signal can never
      // age a patient out of the queue.
      const message = String(error?.message ?? 'flush failed').slice(0, 500);
      for (const item of items) {
        await patientMarkFailed(
          item.clientId,
          attemptsById.get(item.clientId) ?? 0,
          message,
        );
      }
      notify();
      return 0;
    }
    const now = new Date().toISOString();

    for (const result of response.results) {
      if (!result.clientId) continue;

      if (result.success) {
        syncedCount += 1;
        await patientMarkSynced(result.clientId, now);
        // The server holds the images now, so the device's copies are dead
        // weight. Best-effort: a leftover file costs space, never data.
        void cleanUpLocalAttachments(localFilesById.get(result.clientId)).catch(
          () => {},
        );
        continue;
      }

      const nextAttempts = (attemptsById.get(result.clientId) ?? 0) + 1;
      if (nextAttempts >= MAX_REJECT_ATTEMPTS) {
        // Permanently rejected by the server — give up so it can't wedge the queue.
        console.warn(
          `[patients] dropping patient ${result.clientId} after ${nextAttempts} rejections: ${result.message}`,
        );
        await patientDelete(result.clientId);
      } else {
        await patientMarkFailed(
          result.clientId,
          nextAttempts,
          String(result.message ?? 'rejected').slice(0, 500),
        );
      }
    }

    notify();

    // A full batch means there may be more queued — keep draining.
    if (rows.length === FLUSH_BATCH_SIZE) {
      isFlushing = false;
      isFlushPending = false;
      return syncedCount + (await flushPatientOutbox());
    }
  } finally {
    isFlushing = false;
  }

  // A patient queued mid-flush missed this pass — run it now rather than
  // leaving it for the next reconnect.
  if (isFlushPending) {
    isFlushPending = false;
    syncedCount += await flushPatientOutbox();
  }

  return syncedCount;
}
