import { onlineManager, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { CallPeriod } from '@/api/calls';

/** React Query's own view of connectivity (wired to NetInfo in QueryProvider). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export interface OfflineFallback<T> {
  data: T;
  /** When the saved figures were fetched — local calls after this are merged on top. */
  updatedAt: number;
  /** The period those figures cover, e.g. "2026-10-01..2026-10-14". */
  period: string;
}

/**
 * The most recent figures saved on this phone for the same rep and the same
 * MONTH, for use while offline.
 *
 * Analytics queries are keyed by their exact date range, and the default range
 * is "this month up to today" — so it changes every day. Yesterday's figures
 * sit under "…-01..…-14" while today asks for "…-01..…-15": offline, the exact
 * key is never there, and the screen used to sit on a skeleton for good. A
 * period starting on the same day is the same month seen a little earlier;
 * the latest of those is the honest answer when there is no network.
 *
 * Only offline, and only when the exact period has nothing — online, a fresh
 * fetch always wins.
 */
export function useOfflineFallback<T>(
  name: string,
  mieId: string | undefined,
  period: CallPeriod | undefined,
  hasExactData: boolean,
): OfflineFallback<T> | null {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  if (online || hasExactData || !mieId || !period) return null;

  let best: OfflineFallback<T> | null = null;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [name, mieId] })) {
    const key = String(query.queryKey[2] ?? '');
    const [from] = key.split('..');
    if (from !== period.from || query.state.data === undefined) continue;
    if (!best || query.state.dataUpdatedAt > best.updatedAt) {
      best = { data: query.state.data as T, updatedAt: query.state.dataUpdatedAt, period: key };
    }
  }
  return best;
}

/**
 * A query result with the fallback folded in: `isPending` no longer stays true
 * forever while offline (a paused fetch with nothing saved is not "loading" —
 * it is "not available"), and `offlineFallback` says when older figures are
 * standing in.
 */
export function withOfflineState<R extends UseQueryResult<unknown, unknown>>(
  query: R,
  fallback: OfflineFallback<unknown> | null,
) {
  return {
    isPending: query.isPending && !fallback && query.fetchStatus !== 'paused',
    /** Offline with nothing at all saved for this month. */
    isUnavailableOffline: query.data === undefined && !fallback && query.fetchStatus === 'paused',
    offlineFallback: fallback,
  };
}
