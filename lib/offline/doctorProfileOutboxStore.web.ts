import type { DoctorProfileOutboxRow } from './doctorProfileOutboxTypes';

/**
 * Web doctor-profile queue storage, in IndexedDB (expo-sqlite's wasm worker
 * can't be bundled by Metro for web). Same API as the native
 * `doctorProfileOutboxStore.ts`.
 *
 * Why not localStorage, like the other web queues: the browser gives
 * localStorage about 5 MB per site, and the planned-calls offline download
 * fills all of it right after sign-in (one ~65 KB list per rep). Every profile
 * save then failed with "storage is full" — a profile carries a visiting-card
 * photo. IndexedDB has its own, far larger allowance.
 */

const DB_NAME = 'e-detail-doctor-profiles';
const STORE = 'outbox';
/** Where the queue lived before; moved into IndexedDB once, then removed. */
const LEGACY_KEY = 'e_detail_doctor_profile_outbox';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'client_local_id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    }).catch((error) => {
      // Let a later call try again rather than caching the failure forever.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Run one request in a transaction and resolve once the transaction commits. */
async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    let result: T | undefined;
    if (request) request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () =>
      reject(tx.error ?? new Error("this browser's storage is full or unavailable"));
  });
}

async function readAll(): Promise<DoctorProfileOutboxRow[]> {
  return ((await run<DoctorProfileOutboxRow[]>('readonly', (store) => store.getAll())) ??
    []) as DoctorProfileOutboxRow[];
}

async function put(row: DoctorProfileOutboxRow): Promise<void> {
  await run('readwrite', (store) => store.put(row));
}

/** Move rows queued in localStorage by an older build, then free that space. */
async function migrateLegacy(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (raw == null) return;
  try {
    const rows = JSON.parse(raw) as DoctorProfileOutboxRow[];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.client_local_id) await put(row);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.warn('[doctor-profiles] could not move the old web queue', error);
  }
}

export async function openDoctorProfileOutbox(): Promise<void> {
  await openDb();
  await migrateLegacy();
}

export async function profileWrite(
  clientLocalId: string,
  ownerId: string,
  payload: string,
  recordedAt: string,
): Promise<void> {
  const existing = await run<DoctorProfileOutboxRow>('readonly', (store) =>
    store.get(clientLocalId),
  );
  try {
    await put(
      existing
        ? // Edited content is unsynced again until the server accepts THIS version.
          { ...existing, payload, synced_at: null }
        : {
            client_local_id: clientLocalId,
            owner_id: ownerId,
            payload,
            recorded_at: recordedAt,
            synced_at: null,
            attempts: 0,
            last_error: null,
          },
    );
  } catch (error: any) {
    // Saving must not "succeed" when nothing was stored.
    throw new Error(
      `this browser's storage is full or unavailable, so the profile was not stored (${
        error?.name ?? 'IndexedDB error'
      })`,
    );
  }
}

export async function profilePending(limit: number): Promise<DoctorProfileOutboxRow[]> {
  return (await readAll())
    .filter((row) => row.synced_at === null)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .slice(0, limit);
}

export async function profilePendingCount(): Promise<number> {
  return (await readAll()).filter((row) => row.synced_at === null).length;
}

/** Only if the row still holds the uploaded version — see the native store. */
export async function profileMarkSynced(
  clientLocalId: string,
  syncedAt: string,
  sentPayload: string,
): Promise<void> {
  const row = await run<DoctorProfileOutboxRow>('readonly', (store) => store.get(clientLocalId));
  if (row && row.payload === sentPayload) {
    await put({ ...row, synced_at: syncedAt, last_error: null });
  }
}

export async function profileMarkFailed(
  clientLocalId: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  const row = await run<DoctorProfileOutboxRow>('readonly', (store) => store.get(clientLocalId));
  if (row) await put({ ...row, attempts, last_error: lastError });
}

export async function profileDelete(clientLocalId: string): Promise<void> {
  await run('readwrite', (store) => store.delete(clientLocalId));
}

export async function profileAll(): Promise<DoctorProfileOutboxRow[]> {
  return (await readAll()).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}

export async function profilePrune(beforeIso: string): Promise<void> {
  for (const row of await readAll()) {
    if (row.recorded_at < beforeIso && row.synced_at !== null) {
      await profileDelete(row.client_local_id);
    }
  }
}
