import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client';
import { afterInteractions } from '@/lib/afterInteractions';
import { readJson, writeJson, removeRaw } from './fileStore';

/**
 * Persists the React Query cache to the device so the doctor lists, forcing
 * rows and other JSON survive app restarts and remain available offline.
 * Writes are throttled to avoid hammering the file system.
 */
const CLIENT_KEY = 'react-query-cache';
/**
 * How often, at most, the whole cache is written. Each write turns the ENTIRE
 * cache — every doctor, every deck, Content, Analytics — into one JSON string on
 * the JS thread, which is the thread taps run on. At 1.5s a tab switch (which
 * refreshes that screen's data) reliably set a write going just as the next tap
 * landed, and the tap waited for it. Fewer writes, and only once the UI is idle
 * (see flush), keep it out of the way. Sync still saves explicitly at its end.
 */
const WRITE_THROTTLE_MS = 4000;

// Bump when the cached data shape changes, to invalidate stale caches.
// Shared by the React provider and the headless background sync.
// v2: doctor rows gained pmdc / class / last-visit (and dropped the GPS
// "location" field), so any v1 cache must be discarded on upgrade.
// v3: the sales summary gained byBrand, byCustomer and the monthly target. A v2
// cache holds responses from before those existed, and because sales is held for
// 30 minutes those stale rows kept rendering an empty Sales by Brand chart long
// after the backend started returning brands.
export const CACHE_BUSTER = 'v3';

export function createFilePersister(): Persister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    // After any transition or touch handling in progress — never in the middle
    // of one — and never more than 1.5s later, so the write always happens.
    afterInteractions(() => {
      if (pending) {
        const toWrite = pending;
        pending = null;
        void writeJson(CLIENT_KEY, toWrite);
      }
    });
  };

  return {
    persistClient(client) {
      pending = client;
      if (!timer) {
        timer = setTimeout(flush, WRITE_THROTTLE_MS);
      }
    },
    async restoreClient() {
      return (await readJson<PersistedClient>(CLIENT_KEY)) ?? undefined;
    },
    async removeClient() {
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await removeRaw(CLIENT_KEY);
    },
  };
}

// Single shared instance used by both the React provider and the headless
// background sync (so they read/write the same cache file).
export const filePersister = createFilePersister();
