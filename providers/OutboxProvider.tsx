import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';

import {
  flushOutbox,
  getPendingCount,
  initOutbox,
  subscribeOutbox,
  subscribeOutboxSynced,
} from '@/lib/offline/outbox';

interface OutboxContextValue {
  /** Number of call activities still waiting to sync. */
  pendingCount: number;
  /** Manually trigger a flush (e.g. a "Sync now" button). */
  flushNow: () => Promise<void>;
}

const OutboxContext = createContext<OutboxContextValue>({
  pendingCount: 0,
  flushNow: async () => {},
});

/**
 * Query families read back from `call_tracking`. A call is written to the outbox
 * first and only reaches the server on the next flush, so every one of these is
 * out of date the instant a queued call syncs — the doctor's month summary in
 * particular, which is why a just-made call was missing from the analytics until
 * the cache went stale on its own.
 */
const CALL_DERIVED_QUERY_KEYS = [
  ['doctor-call-summary'],
  ['completed-doctors'],
  ['monthly-call-totals'],
  ['engagement'],
  // Both doctor lists carry VisitCount / LastVisit straight off call_tracking:
  // 'planned-doctors' backs Call Reporting, the Doctor List and the Analytics
  // totals; 'doctors' is the team pool behind the Unplanned tab.
  ['planned-doctors'],
  ['doctors'],
] as const;

export function OutboxProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const queryClient = useQueryClient();

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await getPendingCount());
    } catch {
      // ignore
    }
  }, []);

  // Initialize the DB, do a first flush, and keep the pending count live.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await initOutbox();
      if (!mounted) return;
      await refreshCount();
      void flushOutbox().then(refreshCount);
    })();
    const unsubscribe = subscribeOutbox(() => {
      void refreshCount();
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshCount]);

  // A queued call reached the server — drop the caches built from it so the
  // screen the rep is looking at refetches instead of showing pre-call figures.
  useEffect(() => {
    return subscribeOutboxSynced(() => {
      for (const queryKey of CALL_DERIVED_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });
  }, [queryClient]);

  // Flush whenever connectivity is (re)gained.
  useEffect(() => {
    let wasConnected = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected);
      if (!wasConnected && connected) {
        void flushOutbox().then(refreshCount);
      }
      wasConnected = connected;
    });
    return unsubscribe;
  }, [refreshCount]);

  const flushNow = useCallback(async () => {
    await flushOutbox();
    await refreshCount();
  }, [refreshCount]);

  const value = useMemo<OutboxContextValue>(
    () => ({ pendingCount, flushNow }),
    [pendingCount, flushNow],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  return useContext(OutboxContext);
}
