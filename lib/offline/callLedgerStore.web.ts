import type { CallLedgerRow } from './callLedgerTypes';

/**
 * Web call-ledger storage backed by localStorage — same API as the native
 * `callLedgerStore.ts`. Web is a dev convenience (the real app runs natively),
 * so a JSON array is sufficient and stays durable across reloads.
 */

const STORAGE_KEY = 'e_detail_call_ledger';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readAll(): CallLedgerRow[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CallLedgerRow[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: CallLedgerRow[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // storage full / unavailable — best effort
  }
}

export async function openLedger(): Promise<void> {
  if (hasStorage() && localStorage.getItem(STORAGE_KEY) == null) {
    writeAll([]);
  }
}

export async function ledgerWrite(
  clientCallId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const rows = readAll();
  const existing = rows.find((row) => row.client_call_id === clientCallId);

  if (existing) {
    existing.payload = payload;
    // New content is unsynced again until the server accepts THIS version.
    existing.synced_at = null;
  } else {
    rows.push({
      client_call_id: clientCallId,
      payload,
      recorded_at: recordedAt,
      synced_at: null,
    });
  }

  writeAll(rows);
}

export async function ledgerMarkSynced(
  clientCallId: string,
  syncedAt: string,
): Promise<void> {
  writeAll(
    readAll().map((row) =>
      row.client_call_id === clientCallId ? { ...row, synced_at: syncedAt } : row,
    ),
  );
}

export async function ledgerAll(): Promise<CallLedgerRow[]> {
  return readAll().sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

export async function ledgerPrune(beforeIso: string): Promise<void> {
  writeAll(
    readAll().filter(
      (row) => !(row.recorded_at < beforeIso && row.synced_at !== null),
    ),
  );
}
