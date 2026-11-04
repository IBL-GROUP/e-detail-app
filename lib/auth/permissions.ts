import { useSyncExternalStore } from 'react';
import axios from '@/config/axios';
import { readJson, writeJson } from '@/lib/offline/fileStore';

/**
 * What the signed-in rep is allowed to see in this app.
 *
 * Granted in the roles-permission console, the same way the One Thunder
 * dashboards (DSR) whitelist their tabs: a role grants permission codes, and a
 * dashboard card shows only when its VIEW code is held. The backend reads them
 * live (GET /api/me/permissions), so a role change takes effect the next time
 * the app opens or reconnects — no new sign-in, no app release.
 *
 * Cached per rep on the device, because the app is used offline: an offline
 * sign-in shows what that rep was last granted. A rep with nothing cached and
 * no connection sees no cards until they are online once — strict, like DSR.
 *
 * IMPORTANT: this hides UI, it is not access control. The data endpoints do not
 * check these codes.
 */

/** This app's coordinates in organization.permission. */
export const PROJECT_CODE = 'ONE_FOR';
export const MODULE_CODE = 'MOBILE';
export const RESOURCE_CODE = 'E_DETAILING_APP';

/** PROJECT.MODULE.RESOURCE.SECTION.ACTION — built exactly as the console does. */
export function permissionCode(sectionCode: string, actionCode = 'VIEW'): string {
  return [PROJECT_CODE, MODULE_CODE, RESOURCE_CODE, sectionCode, actionCode].join('.');
}

interface PermissionsResponse {
  success: boolean;
  data?: { permissions?: string[] };
}

/** Background work — never worth a long wait on a weak signal. */
const FETCH_TIMEOUT_MS = 8_000;

const cacheKey = (userId: string) => `permissions-${userId}`;

/** `codes` is null until known — from the device cache or the server. */
type State = { userId: string | null; codes: ReadonlySet<string> | null };

let state: State = { userId: null, codes: null };
// Bumped whenever the rep changes, so an answer for the previous rep is dropped.
let generation = 0;
let inFlight: { userId: string; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Forget the signed-out rep's codes (the device cache is kept, like other offline data). */
export function resetPermissions() {
  generation += 1;
  inFlight = null;
  setState({ userId: null, codes: null });
}

/**
 * Load `userId`'s codes: the device cache first, then — when `online` — the
 * server, which replaces the cache. A failed fetch keeps what is cached;
 * nothing cached and nothing fetched means no codes (fail closed).
 */
export function loadPermissions(userId: string, online: boolean): Promise<void> {
  if (state.userId !== userId) {
    generation += 1;
    inFlight = null;
    setState({ userId, codes: null });
  }
  if (online && inFlight?.userId === userId) return inFlight.promise;

  const run = async () => {
    const gen = generation;
    if (!state.codes) {
      const saved = await readJson<string[]>(cacheKey(userId));
      if (gen !== generation) return;
      if (Array.isArray(saved)) setState({ userId, codes: new Set(saved.map(String)) });
    }

    if (online) {
      try {
        const body = (await axios.get('/me/permissions', {
          timeout: FETCH_TIMEOUT_MS,
        })) as unknown as PermissionsResponse;
        const codes = body?.data?.permissions;
        if (gen !== generation) return;
        if (body?.success && Array.isArray(codes)) {
          setState({ userId, codes: new Set(codes.map(String)) });
          void writeJson(cacheKey(userId), codes.map(String));
          return;
        }
      } catch (error) {
        console.log('[Permissions] could not refresh — keeping the last known codes', error);
        if (gen !== generation) return;
      }
    }

    if (!state.codes) setState({ userId, codes: new Set() });
  };

  const promise = run().finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  if (online) inFlight = { userId, promise };
  return promise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

export function usePermissions() {
  const { codes } = useSyncExternalStore(subscribe, getState, getState);
  const has = (code: string) => codes?.has(code) ?? false;
  return {
    /**
     * False until the codes are known. Key off this rather than showing
     * everything while loading, or forbidden cards flash on screen first.
     */
    isReady: codes !== null,
    has,
    /** True when the rep holds this app's `<section>.VIEW` permission. */
    canView: (sectionCode: string) => has(permissionCode(sectionCode)),
  };
}
