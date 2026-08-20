import * as SQLite from 'expo-sqlite';

import type { PatientOutboxRow } from './patientOutboxTypes';

/**
 * Native (iOS/Android) patient-queue storage backed by expo-sqlite. Metro
 * resolves the `.web.ts` sibling on web (where expo-sqlite's wasm worker can't
 * be bundled), so this module is never in the web bundle.
 *
 * Shares the outbox database file with the call queue and ledger — one
 * connection for everything this device has recorded.
 */

const DB_NAME = 'e-detail-outbox.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS patient_outbox (
          client_patient_id TEXT PRIMARY KEY NOT NULL,
          payload           TEXT NOT NULL,
          recorded_at       TEXT NOT NULL,
          synced_at         TEXT,
          attempts          INTEGER NOT NULL DEFAULT 0,
          last_error        TEXT
        );
        CREATE INDEX IF NOT EXISTS patient_outbox_recorded_at
          ON patient_outbox (recorded_at);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function openPatientOutbox(): Promise<void> {
  await getDb();
}

export async function patientWrite(
  clientPatientId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO patient_outbox
       (client_patient_id, payload, recorded_at, synced_at, attempts, last_error)
     VALUES (?, ?, ?, NULL, 0, NULL)
     ON CONFLICT (client_patient_id) DO UPDATE SET
       payload   = excluded.payload,
       -- Edited content is unsynced again until the server accepts THIS version.
       synced_at = NULL`,
    clientPatientId,
    payload,
    recordedAt,
  );
}

/** Rows still to send, oldest first. */
export async function patientPending(limit: number): Promise<PatientOutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<PatientOutboxRow>(
    `SELECT client_patient_id, payload, recorded_at, synced_at, attempts, last_error
     FROM patient_outbox
     WHERE synced_at IS NULL
     ORDER BY recorded_at ASC
     LIMIT ?`,
    limit,
  );
}

export async function patientPendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM patient_outbox WHERE synced_at IS NULL`,
  );
  return row?.n ?? 0;
}

export async function patientMarkSynced(
  clientPatientId: string,
  syncedAt: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE patient_outbox SET synced_at = ?, last_error = NULL
     WHERE client_patient_id = ?`,
    syncedAt,
    clientPatientId,
  );
}

export async function patientMarkFailed(
  clientPatientId: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE patient_outbox SET attempts = ?, last_error = ?
     WHERE client_patient_id = ?`,
    attempts,
    lastError,
    clientPatientId,
  );
}

export async function patientDelete(clientPatientId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM patient_outbox WHERE client_patient_id = ?`,
    clientPatientId,
  );
}

export async function patientAll(): Promise<PatientOutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<PatientOutboxRow>(
    `SELECT client_patient_id, payload, recorded_at, synced_at, attempts, last_error
     FROM patient_outbox
     ORDER BY recorded_at DESC`,
  );
}

/** Drop patients older than the cutoff — only synced ones, never unsent work. */
export async function patientPrune(beforeIso: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM patient_outbox WHERE recorded_at < ? AND synced_at IS NOT NULL`,
    beforeIso,
  );
}
