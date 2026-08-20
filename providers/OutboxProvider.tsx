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
import {
  flushPatientOutbox,
  getPendingPatientCount,
  initPatientOutbox,
  subscribePatientOutbox,
} from '@/lib/offline/patientOutbox';
/** Prefix of every patient-list query key (one per rep). */
const PATIENTS_QUERY_KEY = ['patients'] as const;

interface OutboxContextValue {
  /** Number of call activities still waiting to sync. */
  pendingCount: number;
  /** Number of recorded patients still waiting to sync. */
  pendingPatientCount: number;
  /** Manually trigger a flush of both queues (e.g. a "Sync now" button). */
  flushNow: () => Promise<void>;
}

const OutboxContext = createContext<OutboxContextValue>({
  pendingCount: 0,
  pendingPatientCount: 0,
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
  const [pendingPatientCount, setPendingPatientCount] = useState(0);
  const queryClient = useQueryClient();

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await getPendingCount());
    } catch {
      // ignore
    }
    try {
      setPendingPatientCount(await getPendingPatientCount());
    } catch {
      // ignore
    }
  }, []);

  /**
   * Flush the patient queue and, if anything landed, drop the cached list so it
   * refetches — the server's copy carries the real s_no and created_at, and
   * until it arrives the list is still rendering this device's placeholder row.
   */
  const flushPatients = useCallback(async () => {
    const synced = await flushPatientOutbox();
    if (synced > 0) {
      // The whole family, not one rep's key: this runs outside any screen, so
      // the mieId the list is keyed by isn't in hand here.
      void queryClient.invalidateQueries({ queryKey: PATIENTS_QUERY_KEY });
    }
    return synced;
  }, [queryClient]);

  // Initialize the DBs, do a first flush of both queues, and keep the pending
  // counts live.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await initOutbox();
      await initPatientOutbox();
      if (!mounted) return;
      await refreshCount();
      void flushOutbox().then(refreshCount);
      void flushPatients().then(refreshCount);
    })();
    const unsubscribe = subscribeOutbox(() => {
      void refreshCount();
    });
    const unsubscribePatients = subscribePatientOutbox(() => {
      void refreshCount();
    });
    return () => {
      mounted = false;
      unsubscribe();
      unsubscribePatients();
    };
  }, [refreshCount, flushPatients]);

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
        void flushPatients().then(refreshCount);
      }
      wasConnected = connected;
    });
    return unsubscribe;
  }, [refreshCount, flushPatients]);

  const flushNow = useCallback(async () => {
    await flushOutbox();
    await flushPatients();
    await refreshCount();
  }, [refreshCount, flushPatients]);

  const value = useMemo<OutboxContextValue>(
    () => ({ pendingCount, pendingPatientCount, flushNow }),
    [pendingCount, pendingPatientCount, flushNow],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  return useContext(OutboxContext);
}
