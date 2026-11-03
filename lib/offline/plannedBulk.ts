import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import axios from '@/config/axios';
import { OFFLINE_SYNC_KEY } from '@/config/app-sync';
import { queryClient } from '@/providers/QueryProvider';
import {
  plannedDoctorsKey,
  type DoctorDataRow,
  type DoctorDataResponse,
} from '@/api/doctor';

/**
 * A device-local cache of EVERY rep's planned doctor list, pulled on app open so
 * any rep can see their planned calls offline — even if they never synced
 * individually. Keyed by tsoid (= the app's mieId). This does NOT include the
 * team pool (unplanned) or forcing images — only the planned lists.
 *
 * ONE FILE PER REP (one localStorage key per rep on web). It used to be a single
 * file of every rep — ~34,000 doctor rows — and saving one rep's list read,
 * parsed and rewrote all of it. That ran whenever the rep's own list refreshed,
 * which opening a call does, so the call screen started with a spike of tens of
 * MB on top of decoding its slides: enough for Android to close the app on a
 * low-memory phone. Now a rep's read or save touches only that rep's file.
 */

type PlannedByMie = Record<string, DoctorDataRow[]>;

interface PlannedAllResponse {
  success: boolean;
  count: number;
  reps: number;
  byMie: PlannedByMie;
}

const isWeb = Platform.OS === 'web';
const STORAGE_KEY = 'e_detail_app_planned_bulk';
const directoryUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}e-detail-planned/`
  : null;
/** The old all-reps file, split into per-rep files once by migrateLegacy. */
const legacyFileUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}e-detail-app-planned-bulk.json`
  : null;

// mieIds are digits, but a file name must never be able to escape the folder.
const safeId = (mieId: string) => String(mieId).replace(/[^a-z0-9_-]/gi, '_');
const repFileUri = (mieId: string) =>
  directoryUri ? `${directoryUri}${safeId(mieId)}.json` : null;
const repStorageKey = (mieId: string) => `${STORAGE_KEY}:${safeId(mieId)}`;

async function writeRep(mieId: string, rows: DoctorDataRow[]): Promise<void> {
  const json = JSON.stringify(rows);
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(repStorageKey(mieId), json);
    return;
  }
  const uri = repFileUri(mieId);
  if (uri) await FileSystem.writeAsStringAsync(uri, json);
}

async function ensureDirectory(): Promise<void> {
  if (isWeb || !directoryUri) return;
  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
}

/**
 * Splits the old single all-reps file into per-rep files, then deletes it. Done
 * once, on first use after the upgrade — so a phone that is offline at that
 * moment keeps every list it had. Shared promise: callers never race it.
 */
let migration: Promise<void> | null = null;
function migrateLegacy(): Promise<void> {
  migration ??= (async () => {
    try {
      await ensureDirectory();
      let raw: string | null = null;
      if (isWeb) {
        raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      } else if (legacyFileUri && (await FileSystem.getInfoAsync(legacyFileUri)).exists) {
        raw = await FileSystem.readAsStringAsync(legacyFileUri);
      }
      if (raw === null) return;
      try {
        const byMie = JSON.parse(raw) as PlannedByMie;
        for (const [mieId, rows] of Object.entries(byMie ?? {})) {
          if (Array.isArray(rows) && rows.length > 0) await writeRep(mieId, rows);
        }
      } catch {
        // An unreadable old file has nothing to keep; the next download refills.
      }
      if (isWeb) localStorage.removeItem(STORAGE_KEY);
      else if (legacyFileUri) await FileSystem.deleteAsync(legacyFileUri, { idempotent: true });
    } catch (error) {
      console.warn('[sync] Failed to migrate planned bulk', error);
    }
  })();
  return migration;
}

async function readPlannedForMie(mieId: string): Promise<DoctorDataRow[] | null> {
  await migrateLegacy();
  try {
    let raw: string | null = null;
    if (isWeb) {
      raw = typeof localStorage !== 'undefined' ? localStorage.getItem(repStorageKey(mieId)) : null;
    } else {
      const uri = repFileUri(mieId);
      if (uri && (await FileSystem.getInfoAsync(uri)).exists) {
        raw = await FileSystem.readAsStringAsync(uri);
      }
    }
    return raw ? (JSON.parse(raw) as DoctorDataRow[]) : null;
  } catch (error) {
    console.warn('[sync] Failed to read planned list', mieId, error);
    return null;
  }
}

/**
 * Persist ONE rep's planned list into the local store (upsert by mieId).
 * Called whenever a rep's planned list is loaded (online fetch or sync) so their
 * own data survives logout and is re-seeded on the next (even offline) login —
 * independent of whether the all-reps bulk download succeeded.
 */
export async function savePlannedForMie(
  mieId: string,
  rows: DoctorDataRow[],
): Promise<void> {
  if (!mieId || !rows || rows.length === 0) return;
  await migrateLegacy();
  try {
    await writeRep(String(mieId), rows);
  } catch (error) {
    console.warn('[sync] Failed to persist planned list', mieId, error);
  }
}

/**
 * Pull ALL reps' planned lists and cache them locally. Uses the shared app key
 * (no login needed) so it can run on app open. Best-effort: on error/offline it
 * keeps whatever was last cached.
 *
 * As the single file used to be replaced whole, a rep missing from the download
 * (no longer assigned anyone) has their file removed too.
 */
export async function bootstrapPlannedBulk(): Promise<void> {
  if (!OFFLINE_SYNC_KEY) return;
  try {
    const res = (await axios.get('/doctor/planned-all', {
      headers: { 'x-app-key': OFFLINE_SYNC_KEY },
    })) as unknown as PlannedAllResponse;
    if (!res?.success || !res.byMie) return;

    await migrateLegacy();
    const keep = new Set<string>();
    for (const [mieId, rows] of Object.entries(res.byMie)) {
      keep.add(safeId(mieId));
      await writeRep(mieId, Array.isArray(rows) ? rows : []);
    }

    if (isWeb) {
      if (typeof localStorage === 'undefined') return;
      const prefix = `${STORAGE_KEY}:`;
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && !keep.has(key.slice(prefix.length))) {
          localStorage.removeItem(key);
        }
      }
    } else if (directoryUri) {
      for (const name of await FileSystem.readDirectoryAsync(directoryUri)) {
        if (!keep.has(name.replace(/\.json$/, ''))) {
          await FileSystem.deleteAsync(`${directoryUri}${name}`, { idempotent: true });
        }
      }
    }
  } catch (error) {
    console.warn('[sync] planned bulk download failed', error);
  }
}

/**
 * Seed the Planned screen's query cache for one rep from the local bulk cache,
 * so their planned calls render offline. Does NOT overwrite data already in the
 * cache (e.g. a fresh online fetch), so it only fills the gap.
 */
export async function seedPlannedFromBulk(
  teamId: number,
  mieId: string,
): Promise<void> {
  const key = plannedDoctorsKey(teamId, mieId, undefined);
  if (queryClient.getQueryData(key)) return; // don't clobber fresher data

  const rows = await readPlannedForMie(String(mieId));
  if (!rows || rows.length === 0) return;
  // Fetched while the file was being read — the fresher data stays.
  if (queryClient.getQueryData(key)) return;

  const page: DoctorDataResponse = {
    success: true,
    count: rows.length,
    totalCount: rows.length,
    offset: 0,
    limit: rows.length,
    hasMore: false,
    data: rows,
  };
  queryClient.setQueryData(key, { pages: [page], pageParams: [0] });
}
