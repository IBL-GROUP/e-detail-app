import type { DoctorProfileOutboxRow } from './doctorProfileOutboxTypes';

/**
 * Web doctor-profile queue storage backed by localStorage (expo-sqlite's wasm
 * worker can't be bundled by Metro for web). Same API as the native
 * `doctorProfileOutboxStore.ts`. Web is a dev convenience, as for patients.
 */

const STORAGE_KEY = 'e_detail_doctor_profile_outbox';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readAll(): DoctorProfileOutboxRow[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DoctorProfileOutboxRow[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: DoctorProfileOutboxRow[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // storage full / unavailable — best effort
  }
}

export async function openDoctorProfileOutbox(): Promise<void> {
  if (hasStorage() && localStorage.getItem(STORAGE_KEY) == null) {
    writeAll([]);
  }
}

export async function profileWrite(
  clientLocalId: string,
  ownerId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const rows = readAll();
  const existing = rows.find((row) => row.client_local_id === clientLocalId);

  if (existing) {
    existing.payload = payload;
    // Edited content is unsynced again until the server accepts THIS version.
    existing.synced_at = null;
  } else {
    rows.push({
      client_local_id: clientLocalId,
      owner_id: ownerId,
      payload,
      recorded_at: recordedAt,
      synced_at: null,
      attempts: 0,
      last_error: null,
    });
  }

  writeAll(rows);
}

export async function profilePending(limit: number): Promise<DoctorProfileOutboxRow[]> {
  return readAll()
    .filter((row) => row.synced_at === null)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .slice(0, limit);
}

export async function profilePendingCount(): Promise<number> {
  return readAll().filter((row) => row.synced_at === null).length;
}

/** Only if the row still holds the uploaded version — see the native store. */
export async function profileMarkSynced(
  clientLocalId: string,
  syncedAt: string,
  sentPayload: string,
): Promise<void> {
  writeAll(
    readAll().map((row) =>
      row.client_local_id === clientLocalId && row.payload === sentPayload
        ? { ...row, synced_at: syncedAt, last_error: null }
        : row,
    ),
  );
}

export async function profileMarkFailed(
  clientLocalId: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  writeAll(
    readAll().map((row) =>
      row.client_local_id === clientLocalId
        ? { ...row, attempts, last_error: lastError }
        : row,
    ),
  );
}

export async function profileDelete(clientLocalId: string): Promise<void> {
  writeAll(readAll().filter((row) => row.client_local_id !== clientLocalId));
}

export async function profileAll(): Promise<DoctorProfileOutboxRow[]> {
  return readAll().sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}

export async function profilePrune(beforeIso: string): Promise<void> {
  writeAll(
    readAll().filter(
      (row) => !(row.recorded_at < beforeIso && row.synced_at !== null),
    ),
  );
}
