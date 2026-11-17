import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { DoctorProfileFields } from '@/api/doctorProfiles';
import * as fileStore from './fileStore';

/**
 * Where drafts live. Phones: the app's file store, as before. Web: IndexedDB,
 * because the file store is localStorage there, which the planned-calls
 * download fills right after sign-in — every draft write failed, so a
 * half-filled form was lost on reload. (Same reason as the web profile queue.)
 */
const WEB_DB = 'e-detail-doctor-profile-drafts';
const WEB_STORE = 'drafts';
let webDb: Promise<IDBDatabase> | null = null;

function openWebDb(): Promise<IDBDatabase> {
  if (!webDb) {
    webDb = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(WEB_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(WEB_STORE)) {
          request.result.createObjectStore(WEB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    }).catch((error) => {
      webDb = null;
      throw error;
    });
  }
  return webDb;
}

async function webRequest<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openWebDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(WEB_STORE, mode);
    const request = work(tx.objectStore(WEB_STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const onWebDb = () => Platform.OS === 'web' && typeof indexedDB !== 'undefined';

async function readJson<T>(key: string): Promise<T | null> {
  if (!onWebDb()) return fileStore.readJson<T>(key);
  try {
    return ((await webRequest('readonly', (store) => store.get(key))) as T | undefined) ?? null;
  } catch (error) {
    console.warn('[doctor-profiles] draft read failed', key, error);
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  if (!onWebDb()) return fileStore.writeJson(key, value);
  try {
    await webRequest('readwrite', (store) => store.put(value, key));
  } catch (error) {
    console.warn('[doctor-profiles] draft write failed', key, error);
  }
}

async function removeRaw(key: string): Promise<void> {
  if (!onWebDb()) return fileStore.removeRaw(key);
  try {
    await webRequest('readwrite', (store) => store.delete(key));
  } catch (error) {
    console.warn('[doctor-profiles] draft delete failed', key, error);
  }
}

/**
 * In-progress doctor-profile forms, kept on the device until they are saved —
 * the Searle app's DoctorDraftStore. One draft per (user, PMDC), plus an index
 * of which PMDCs have one, so the assigned list can mark those doctors "Draft".
 *
 * Nothing here is sent to the server; Save moves the form into the profile
 * queue and deletes the draft.
 */

export interface DoctorProfileDraft {
  form: DoctorProfileFields;
  step: number;
  whatsappManual: boolean;
}

const normalize = (pmdc: string) => pmdc.trim().toUpperCase();
const draftKey = (userId: string, pmdc: string) =>
  `doctor-profile-draft-${userId}-${normalize(pmdc)}`;
const indexKey = (userId: string) => `doctor-profile-drafts-${userId}`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

async function readIndex(userId: string): Promise<string[]> {
  const list = await readJson<string[]>(indexKey(userId));
  return Array.isArray(list) ? list.map(String) : [];
}

export async function loadDraft(userId: string, pmdc: string): Promise<DoctorProfileDraft | null> {
  const draft = await readJson<DoctorProfileDraft>(draftKey(userId, pmdc));
  return draft?.form ? draft : null;
}

export async function saveDraft(
  userId: string,
  pmdc: string,
  draft: DoctorProfileDraft,
): Promise<void> {
  await writeJson(draftKey(userId, pmdc), draft);
  const index = await readIndex(userId);
  const key = normalize(pmdc);
  if (!index.includes(key)) {
    await writeJson(indexKey(userId), [...index, key]);
    notify();
  }
}

export async function clearDraft(userId: string, pmdc: string): Promise<void> {
  await removeRaw(draftKey(userId, pmdc));
  const index = await readIndex(userId);
  const key = normalize(pmdc);
  if (index.includes(key)) {
    await writeJson(
      indexKey(userId),
      index.filter((entry) => entry !== key),
    );
  }
  notify();
}

/** PMDC numbers (upper-cased) this user has an unsaved draft for, kept live. */
export function useDraftPmdcs(userId?: string): Set<string> {
  const [pmdcs, setPmdcs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setPmdcs(new Set());
      return undefined;
    }
    let active = true;
    const load = () => {
      void readIndex(userId).then((list) => {
        if (active) setPmdcs(new Set(list));
      });
    };
    load();
    listeners.add(load);
    return () => {
      active = false;
      listeners.delete(load);
    };
  }, [userId]);

  return pmdcs;
}
