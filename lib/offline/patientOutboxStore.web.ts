import type { PatientOutboxRow } from './patientOutboxTypes';

/**
 * Web patient-queue storage backed by localStorage (expo-sqlite's wasm worker
 * can't be bundled by Metro for web). Same API as the native
 * `patientOutboxStore.ts`. Web is a dev convenience — the real app runs
 * natively — so a JSON array is sufficient and stays durable across reloads.
 */

const STORAGE_KEY = 'e_detail_patient_outbox';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readAll(): PatientOutboxRow[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PatientOutboxRow[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: PatientOutboxRow[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // storage full / unavailable — best effort
  }
}

export async function openPatientOutbox(): Promise<void> {
  if (hasStorage() && localStorage.getItem(STORAGE_KEY) == null) {
    writeAll([]);
  }
}

export async function patientWrite(
  clientPatientId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const rows = readAll();
  const existing = rows.find((row) => row.client_patient_id === clientPatientId);

  if (existing) {
    existing.payload = payload;
    // Edited content is unsynced again until the server accepts THIS version.
    existing.synced_at = null;
  } else {
    rows.push({
      client_patient_id: clientPatientId,
      payload,
      recorded_at: recordedAt,
      synced_at: null,
      attempts: 0,
      last_error: null,
    });
  }

  writeAll(rows);
}

export async function patientPending(limit: number): Promise<PatientOutboxRow[]> {
  return readAll()
    .filter((row) => row.synced_at === null)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .slice(0, limit);
}

export async function patientPendingCount(): Promise<number> {
  return readAll().filter((row) => row.synced_at === null).length;
}

export async function patientMarkSynced(
  clientPatientId: string,
  syncedAt: string,
): Promise<void> {
  writeAll(
    readAll().map((row) =>
      row.client_patient_id === clientPatientId
        ? { ...row, synced_at: syncedAt, last_error: null }
        : row,
    ),
  );
}

export async function patientMarkFailed(
  clientPatientId: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  writeAll(
    readAll().map((row) =>
      row.client_patient_id === clientPatientId
        ? { ...row, attempts, last_error: lastError }
        : row,
    ),
  );
}

export async function patientDelete(clientPatientId: string): Promise<void> {
  writeAll(readAll().filter((row) => row.client_patient_id !== clientPatientId));
}

export async function patientAll(): Promise<PatientOutboxRow[]> {
  return readAll().sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}

export async function patientPrune(beforeIso: string): Promise<void> {
  writeAll(
    readAll().filter(
      (row) => !(row.recorded_at < beforeIso && row.synced_at !== null),
    ),
  );
}
