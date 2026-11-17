import * as SQLite from 'expo-sqlite';

import type { DoctorProfileOutboxRow } from './doctorProfileOutboxTypes';

/**
 * Native (iOS/Android) doctor-profile queue storage backed by expo-sqlite.
 * Metro resolves the `.web.ts` sibling on web, so this module is never in the
 * web bundle.
 *
 * Shares the outbox database file with the call and patient queues — one
 * connection for everything this device has recorded.
 */

const DB_NAME = 'e-detail-outbox.db';

const COLUMNS =
  'client_local_id, owner_id, payload, recorded_at, synced_at, attempts, last_error';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS doctor_profile_outbox (
          client_local_id TEXT PRIMARY KEY NOT NULL,
          owner_id        TEXT NOT NULL,
          payload         TEXT NOT NULL,
          recorded_at     TEXT NOT NULL,
          synced_at       TEXT,
          attempts        INTEGER NOT NULL DEFAULT 0,
          last_error      TEXT
        );
        CREATE INDEX IF NOT EXISTS doctor_profile_outbox_recorded_at
          ON doctor_profile_outbox (recorded_at);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function openDoctorProfileOutbox(): Promise<void> {
  await getDb();
}

export async function profileWrite(
  clientLocalId: string,
  ownerId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO doctor_profile_outbox
       (client_local_id, owner_id, payload, recorded_at, synced_at, attempts, last_error)
     VALUES (?, ?, ?, ?, NULL, 0, NULL)
     ON CONFLICT (client_local_id) DO UPDATE SET
       payload   = excluded.payload,
       -- Edited content is unsynced again until the server accepts THIS version.
       synced_at = NULL`,
    clientLocalId,
    ownerId,
    payload,
    recordedAt,
  );
}

/** Rows still to send, oldest first — every owner's, since each was signed for. */
export async function profilePending(limit: number): Promise<DoctorProfileOutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<DoctorProfileOutboxRow>(
    `SELECT ${COLUMNS}
     FROM doctor_profile_outbox
     WHERE synced_at IS NULL
     ORDER BY recorded_at ASC
     LIMIT ?`,
    limit,
  );
}

export async function profilePendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM doctor_profile_outbox WHERE synced_at IS NULL`,
  );
  return row?.n ?? 0;
}

/**
 * Marks a row synced — only if it still holds `sentPayload`, the version that
 * was uploaded. Same guard as the patient queue.
 */
export async function profileMarkSynced(
  clientLocalId: string,
  syncedAt: string,
  sentPayload: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE doctor_profile_outbox SET synced_at = ?, last_error = NULL
     WHERE client_local_id = ? AND payload = ?`,
    syncedAt,
    clientLocalId,
    sentPayload,
  );
}

export async function profileMarkFailed(
  clientLocalId: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE doctor_profile_outbox SET attempts = ?, last_error = ?
     WHERE client_local_id = ?`,
    attempts,
    lastError,
    clientLocalId,
  );
}

export async function profileDelete(clientLocalId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM doctor_profile_outbox WHERE client_local_id = ?`,
    clientLocalId,
  );
}

export async function profileAll(): Promise<DoctorProfileOutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<DoctorProfileOutboxRow>(
    `SELECT ${COLUMNS}
     FROM doctor_profile_outbox
     ORDER BY recorded_at DESC`,
  );
}

/** Drop profiles older than the cutoff — only synced ones, never unsent work. */
export async function profilePrune(beforeIso: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM doctor_profile_outbox WHERE recorded_at < ? AND synced_at IS NOT NULL`,
    beforeIso,
  );
}
