import * as SQLite from 'expo-sqlite';

import type { CallLedgerRow } from './callLedgerTypes';

/**
 * Native (iOS/Android) call-ledger storage backed by expo-sqlite. Metro resolves
 * the `.web.ts` sibling on web, so this module is never in the web bundle.
 *
 * Shares the outbox database file — one connection, and the two tables are
 * always written together.
 */

const DB_NAME = 'e-detail-outbox.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS call_ledger (
          client_call_id TEXT PRIMARY KEY NOT NULL,
          payload        TEXT NOT NULL,
          recorded_at    TEXT NOT NULL,
          synced_at      TEXT
        );
        CREATE INDEX IF NOT EXISTS call_ledger_recorded_at
          ON call_ledger (recorded_at);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function openLedger(): Promise<void> {
  await getDb();
}

/** Insert the call, or replace the payload of one already recorded. */
export async function ledgerWrite(
  clientCallId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO call_ledger (client_call_id, payload, recorded_at, synced_at)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT (client_call_id) DO UPDATE SET
       payload   = excluded.payload,
       -- New content is unsynced again until the server accepts THIS version.
       synced_at = NULL`,
    clientCallId,
    payload,
    recordedAt,
  );
}

export async function ledgerMarkSynced(
  clientCallId: string,
  syncedAt: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE call_ledger SET synced_at = ? WHERE client_call_id = ?`,
    syncedAt,
    clientCallId,
  );
}

export async function ledgerAll(): Promise<CallLedgerRow[]> {
  const db = await getDb();
  return db.getAllAsync<CallLedgerRow>(
    `SELECT client_call_id, payload, recorded_at, synced_at
     FROM call_ledger
     ORDER BY recorded_at ASC`,
  );
}

/** Drop calls older than the cutoff — only synced ones, never unsent work. */
export async function ledgerPrune(beforeIso: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM call_ledger WHERE recorded_at < ? AND synced_at IS NOT NULL`,
    beforeIso,
  );
}
