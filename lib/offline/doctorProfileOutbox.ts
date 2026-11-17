import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';

import axios from '@/config/axios';
import {
  discardLocalAttachment,
  isLocalAttachment,
  persistPickedImage,
} from './patientAttachments';
import { uploadPendingVisitingCard } from './visitingCards';
// Type-only, so this file has no runtime dependency on the api module — which
// imports THIS one. The same one-way shape as the patient queue.
import type { DoctorProfileInput } from '@/api/doctorProfiles';
import {
  openDoctorProfileOutbox,
  profileAll,
  profileDelete,
  profileMarkFailed,
  profileMarkSynced,
  profilePending,
  profilePendingCount,
  profilePrune,
  profileWrite,
} from './doctorProfileOutboxStore';

/**
 * A durable, offline-first write queue for doctor profiles — the patient
 * queue's guarantee, applied to doctors_info.
 *
 * Every profile is written to the device FIRST (even when online) and only then
 * flushed, so capturing one never depends on signal. The server upserts on
 * (owner, clientLocalId) and keeps the latest clientUpdatedAt (DOC-BR-010), so a
 * retried flush can never file the doctor twice.
 *
 * A synced row is KEPT, as for patients: the assigned list marks the doctor
 * captured from it until a refetch brings the server's copy back.
 */

// The server takes at most 25 profiles per batch (DOC-FR-009).
const FLUSH_BATCH_SIZE = 25;
// Dropped after this many explicit refusals (4xx) — never for network or 5xx.
const MAX_REJECT_ATTEMPTS = 5;
// Synced profiles older than this are dropped from the device.
const RETAIN_DAYS = 90;

export interface BatchProfileResult {
  clientId: string | null;
  success: boolean;
  id?: string | null;
  /** HTTP-style status of a failed item: 4xx refused, 5xx server failure. */
  status?: number;
  message?: string;
}

interface BatchProfileResponse {
  success: boolean;
  count: number;
  results: BatchProfileResult[];
}

/** Same rule as the call and patient queues: only a 4xx is a refusal. */
function isContentRejection(status?: number) {
  return typeof status === 'number' && status >= 400 && status < 500;
}

async function postProfilesBatch(
  profiles: (DoctorProfileInput & { clientId: string })[],
): Promise<BatchProfileResponse> {
  return axios.post('/doctor-profiles/batch', {
    profiles,
  }) as unknown as Promise<BatchProfileResponse>;
}

/**
 * The server's own reason when it gave one (e.g. "Uploads must go to …", a
 * validation message), else the transport's ("Network Error").
 */
function failureReason(error: any, fallback: string): string {
  const fromServer = error?.response?.data?.message;
  const status = error?.response?.status;
  const text = String(fromServer || error?.message || fallback);
  return (status ? `${text} (HTTP ${status})` : text).slice(0, 500);
}

let isFlushing = false;
// A flush asked for while one was already running, replayed once it ends.
let isFlushPending = false;

/** Wait for a running flush to finish (bounded, so a hung request can't block Save forever). */
async function waitForFlushIdle(timeoutMs = 45_000): Promise<void> {
  const started = Date.now();
  while (isFlushing && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export interface SyncNowResult {
  /** The server stored it. */
  synced: boolean;
  /** No connection — it stays queued and uploads when the phone is back online. */
  offline: boolean;
  /** Why the server didn't store it, when it was online and tried. */
  error: string | null;
}

/**
 * Online Save, as the Searle app does it (create → SyncEngine.run, awaited):
 * upload this profile now and report what the server said, instead of firing
 * the upload in the background and saying nothing. Offline it just stays
 * queued. Never throws.
 */
export async function syncDoctorProfileNow(clientLocalId: string): Promise<SyncNowResult> {
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return { synced: false, offline: true, error: null };

    // Another flush may hold the lock (it then skips this call) — let it end,
    // run ours, and let any replay end too, before reading the outcome.
    await waitForFlushIdle();
    await flushDoctorProfileOutbox();
    await waitForFlushIdle();

    const row = (await profileAll()).find((entry) => entry.client_local_id === clientLocalId);
    if (!row) {
      return {
        synced: false,
        offline: false,
        error: 'The server refused this profile and it was removed from the queue.',
      };
    }
    if (row.synced_at != null) return { synced: true, offline: false, error: null };
    return {
      synced: false,
      offline: false,
      error: row.last_error || 'The server did not confirm the save. It will retry automatically.',
    };
  } catch (error: any) {
    return { synced: false, offline: false, error: failureReason(error, 'Upload failed') };
  }
}

const listeners = new Set<() => void>();

// Parsed rows, cached and shared. Cleared on any write.
let snapshot: LocalDoctorProfile[] | null = null;
let loading: Promise<LocalDoctorProfile[]> | null = null;

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

/** Subscribe to queue changes (a profile captured, discarded or accepted). */
export function subscribeDoctorProfileOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const syncedListeners = new Set<() => void>();

/**
 * Subscribe to "the server accepted profiles", whoever ran the flush, so the
 * cached lists can refetch and pick up the server's copy.
 */
export function subscribeDoctorProfilesSynced(listener: () => void): () => void {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

/** Initialize the store early (called at app start). */
export async function initDoctorProfileOutbox(): Promise<void> {
  await openDoctorProfileOutbox();
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000);
  try {
    await profilePrune(cutoff.toISOString());
  } catch {
    // pruning is housekeeping — never block startup on it
  }
}

/** Profiles still waiting to reach the server. */
export async function getPendingDoctorProfileCount(): Promise<number> {
  return profilePendingCount();
}

/** A profile captured on this device, with its sync state. */
export interface LocalDoctorProfile {
  clientLocalId: string;
  ownerId: string;
  profile: DoctorProfileInput;
  /** ISO timestamp the server accepted it, or null while still local. */
  syncedAt: string | null;
  recordedAt: string;
  /** Why the last flush failed, when it did. */
  lastError: string | null;
}

/**
 * Queue one profile for `ownerId` (the signed-in user). Writes locally, then
 * kicks off a best-effort flush. Resolves once the row is on disk, so the form
 * can close immediately regardless of connectivity.
 */
export async function enqueueDoctorProfile(
  ownerId: string,
  payload: Omit<DoctorProfileInput, 'clientLocalId' | 'clientUpdatedAt'> & {
    clientLocalId?: string;
  },
  /** `flush: false` when the caller uploads it itself (syncDoctorProfileNow). */
  options: { flush?: boolean } = {},
): Promise<string> {
  const clientLocalId = payload.clientLocalId || Crypto.randomUUID();

  // The camera hands back a cache-directory URI the OS may clear at any time.
  // Copy it somewhere durable BEFORE the row is queued.
  const card = String(payload.visitingCardUrl ?? '').trim();
  const visitingCardUrl = card && isLocalAttachment(card) ? await persistPickedImage(card) : card;

  const profile: DoctorProfileInput = {
    ...payload,
    visitingCardUrl,
    clientLocalId,
    // The server keeps the latest edit by this stamp (DOC-BR-010).
    clientUpdatedAt: new Date().toISOString(),
  };

  await profileWrite(
    clientLocalId,
    ownerId,
    JSON.stringify(profile),
    new Date().toISOString(),
  );
  notify();
  // Fire-and-forget; never block the caller on the network.
  if (options.flush !== false) void flushDoctorProfileOutbox();
  return clientLocalId;
}

/**
 * Throw away a profile that has NOT reached the server — the Searle app's
 * "delete unsaved doctor". A synced one is the server's now and is left alone.
 */
export async function discardDoctorProfile(clientLocalId: string): Promise<boolean> {
  const rows = await profileAll();
  const row = rows.find((entry) => entry.client_local_id === clientLocalId);
  if (!row || row.synced_at != null) return false;

  const profile = parseRow(row.payload);
  await profileDelete(clientLocalId);
  if (profile?.visitingCardUrl) await discardLocalAttachment(profile.visitingCardUrl);
  notify();
  return true;
}

function parseRow(payload: string): DoctorProfileInput | null {
  try {
    return JSON.parse(payload) as DoctorProfileInput;
  } catch {
    return null;
  }
}

/** Every profile this device has captured (all owners), newest first. */
export async function getLocalDoctorProfiles(): Promise<LocalDoctorProfile[]> {
  if (snapshot) return snapshot;

  if (!loading) {
    loading = (async () => {
      try {
        const rows = await profileAll();
        const parsed = rows
          .map((row) => {
            const profile = parseRow(row.payload);
            if (!profile) return null;
            return {
              clientLocalId: row.client_local_id,
              ownerId: row.owner_id,
              profile,
              syncedAt: row.synced_at,
              recordedAt: row.recorded_at,
              lastError: row.last_error,
            } satisfies LocalDoctorProfile;
          })
          .filter((entry): entry is LocalDoctorProfile => entry !== null);
        snapshot = parsed;
        return parsed;
      } catch (error) {
        console.warn('[doctor-profiles] failed to read local profiles', error);
        return [];
      } finally {
        loading = null;
      }
    })();
  }

  return loading;
}

/**
 * Push queued profiles to the backend. Safe to call anytime: it does nothing
 * when offline or empty. Accepted rows are marked synced (not deleted);
 * failures keep their row to retry later. Returns how many the server accepted.
 */
export async function flushDoctorProfileOutbox(): Promise<number> {
  if (isFlushing) {
    isFlushPending = true;
    return 0;
  }
  // Claimed BEFORE the first await, so two callers can't send the same rows.
  isFlushing = true;

  let syncedCount = 0;

  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return 0;

    const rows = await profilePending(FLUSH_BATCH_SIZE);
    if (rows.length === 0) return 0;

    const items: (DoctorProfileInput & { clientId: string })[] = [];
    const localCardById = new Map<string, string>();

    for (const row of rows) {
      const profile = parseRow(row.payload);
      if (!profile) {
        console.warn(
          `[doctor-profiles] dropping unreadable queued profile ${row.client_local_id}`,
        );
        await profileDelete(row.client_local_id);
        continue;
      }

      /**
       * The card goes up FIRST, and the profile carries the server path it came
       * back as. If the upload fails the row is held over — a profile filed
       * without the card the BRD makes mandatory is worse than one an hour late.
       */
      let visitingCardUrl: string;
      try {
        visitingCardUrl = await uploadPendingVisitingCard(profile.visitingCardUrl);
      } catch (error: any) {
        await profileMarkFailed(
          row.client_local_id,
          row.attempts,
          `Visiting card upload failed: ${failureReason(error, 'upload failed')}`,
        );
        continue;
      }

      if (profile.visitingCardUrl && isLocalAttachment(profile.visitingCardUrl)) {
        localCardById.set(row.client_local_id, profile.visitingCardUrl);
      }
      items.push({ ...profile, visitingCardUrl, clientId: row.client_local_id });
    }

    if (items.length === 0) {
      notify();
      return 0;
    }

    const attemptsById = new Map(rows.map((row) => [row.client_local_id, row.attempts]));
    // The version each row was read at — an edit saved mid-flight stays unsynced.
    const payloadById = new Map(rows.map((row) => [row.client_local_id, row.payload]));

    let response;
    try {
      response = await postProfilesBatch(items);
    } catch (error: any) {
      // Network/server failure: keep every row, and leave `attempts` alone —
      // it counts explicit refusals only.
      const message = failureReason(error, 'flush failed');
      for (const item of items) {
        await profileMarkFailed(item.clientId, attemptsById.get(item.clientId) ?? 0, message);
      }
      notify();
      return 0;
    }
    const now = new Date().toISOString();

    for (const result of response.results ?? []) {
      if (!result.clientId) continue;

      if (result.success) {
        syncedCount += 1;
        await profileMarkSynced(result.clientId, now, payloadById.get(result.clientId) ?? '');
        // The server holds the card now. Best-effort cleanup of the local copy.
        const localCard = localCardById.get(result.clientId);
        if (localCard) void discardLocalAttachment(localCard).catch(() => {});
        continue;
      }

      if (!isContentRejection(result.status)) {
        // The server failed rather than refused — keep it queued indefinitely.
        await profileMarkFailed(
          result.clientId,
          attemptsById.get(result.clientId) ?? 0,
          String(result.message ?? 'server error').slice(0, 500),
        );
        continue;
      }

      const nextAttempts = (attemptsById.get(result.clientId) ?? 0) + 1;
      if (nextAttempts >= MAX_REJECT_ATTEMPTS) {
        // Permanently refused (e.g. the doctor is already profiled from another
        // device, DOC-BR-011) — give up so it can't wedge the queue.
        console.warn(
          `[doctor-profiles] dropping profile ${result.clientId} after ${nextAttempts} rejections: ${result.message}`,
        );
        await profileDelete(result.clientId);
      } else {
        await profileMarkFailed(
          result.clientId,
          nextAttempts,
          String(result.message ?? 'rejected').slice(0, 500),
        );
      }
    }

    notify();
    if (syncedCount > 0) {
      syncedListeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // ignore listener errors
        }
      });
    }

    // A full batch means there may be more queued — keep draining, but only
    // while the pass got something through: a batch of rows that all failed
    // (cards that won't upload, a server refusing them) would otherwise be
    // re-read and re-sent in a tight loop.
    if (rows.length === FLUSH_BATCH_SIZE && syncedCount > 0) {
      isFlushing = false;
      isFlushPending = false;
      return syncedCount + (await flushDoctorProfileOutbox());
    }
  } finally {
    isFlushing = false;
  }

  // A profile queued mid-flush missed this pass — run it now.
  if (isFlushPending) {
    isFlushPending = false;
    syncedCount += await flushDoctorProfileOutbox();
  }

  return syncedCount;
}
