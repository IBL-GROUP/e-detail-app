import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { useAuth } from '@/providers/AuthProvider';
import { loadImageManifest, type DownloadProgress } from '@/lib/offline/imageCache';
import { getSyncMeta, todayWorkday } from '@/lib/offline/syncMeta';
import { runSync } from '@/lib/offline/runSync';
import { seedPlannedFromBulk } from '@/lib/offline/plannedBulk';
import { flushUsage, recordUsageEvent } from '@/lib/usage/usageLog';
import { prefetchAnalytics } from '@/lib/offline/prefetchAnalytics';

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/**
 * Where a sync came from, for the usage log. The first four are the rep
 * pressing something; the rest the app deciding to sync by itself (the
 * overnight background task logs "background" from lib/offline/backgroundSync).
 */
export type SyncSource =
  | 'settings_button'
  | 'sync_gate_button'
  | 'status_banner'
  | 'sync_details'
  | 'login_or_open'
  | 'stale_catchup';

const MANUAL_SOURCES = new Set<SyncSource>([
  'settings_button',
  'sync_gate_button',
  'status_banner',
  'sync_details',
]);

interface SyncContextValue {
  status: SyncStatus;
  progress: DownloadProgress | null;
  lastSyncedFor: string | null;
  lastSyncedAt: string | null;
  isOnline: boolean;
  isHydrated: boolean;
  /** True when there is cached data, but it is not for today's workday. */
  isStale: boolean;
  /** True when there is no synced data at all. */
  hasNoData: boolean;
  /** Runs a sync. `source` says what asked for it — see SyncSource. */
  syncNow: (source: SyncSource) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

/** Slowest the sync progress counter may update. */
const PROGRESS_INTERVAL_MS = 250;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated: isSignedIn, isOfflineSession } = useAuth();
  // Syncing needs a server token. An offline session has none, so every sync
  // request would only come back 401 — hold off until it upgrades to a real one,
  // at which point the effects below fire the sync it missed.
  const isAuthenticated = isSignedIn && !isOfflineSession;
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [lastSyncedFor, setLastSyncedFor] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const runningRef = useRef(false);
  // Guards the auto catch-up so a failing sync doesn't retry in a tight loop.
  // Re-armed only when connectivity returns (offline -> online).
  const autoSyncAttemptedRef = useRef(false);
  const wasOnlineRef = useRef(true);
  // The user id we've already run a login/app-open sync for this process, so we
  // pull fresh data once per user without re-syncing on every render.
  const loginSyncedForRef = useRef<string | null>(null);

  // Load persisted manifest + sync metadata on startup.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadImageManifest();
      const meta = await getSyncMeta();
      if (!mounted) return;
      setLastSyncedFor(meta.lastSyncedFor);
      setLastSyncedAt(meta.lastSyncedAt);
      setIsHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Track connectivity for the UI (React Query's onlineManager is wired
  // separately in QueryProvider).
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const next = Boolean(state.isConnected);
      // On reconnect, allow one fresh auto catch-up attempt.
      if (!wasOnlineRef.current && next) {
        autoSyncAttemptedRef.current = false;
      }
      wasOnlineRef.current = next;
      setIsOnline(next);
    });
    return unsubscribe;
  }, []);

  // Coming back to the app is when a new day shows up: re-render so the stale
  // check below sees today's date, and allow one more catch-up attempt.
  const [, setForegroundTick] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      autoSyncAttemptedRef.current = false;
      setForegroundTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);

  // Seed the Planned screen from the on-device bulk cache as soon as we know the
  // rep, so their planned calls render offline even if they never synced
  // individually. Only fills an empty cache (won't clobber a fresh online fetch).
  useEffect(() => {
    if (!isHydrated || !user?.mieId || !user?.teamId) return;
    void seedPlannedFromBulk(Number(user.teamId), String(user.mieId));
  }, [isHydrated, user?.mieId, user?.teamId]);

  const syncNow = useCallback(async (source: SyncSource) => {
    // A press while a sync is already running is not a second sync, and is
    // not logged as one.
    if (runningRef.current) return;
    const mieId = user?.mieId;
    const teamId = user?.teamId;
    if (!mieId || !teamId || !isAuthenticated) return;

    runningRef.current = true;
    setStatus('syncing');
    setProgress(null);
    const startedAt = Date.now();
    const logSync = (outcome: 'success' | 'error', error?: unknown) =>
      void recordUsageEvent('sync', user, {
        trigger: MANUAL_SOURCES.has(source) ? 'manual' : 'auto',
        source,
        outcome,
        started_at: new Date(startedAt).toISOString(),
        seconds: Math.round((Date.now() - startedAt) / 1000),
        error: error ? String((error as Error)?.message ?? error).slice(0, 300) : null,
      });

    try {
      // At most a few progress updates a second (and always the last one): each
      // one re-renders everything reading this context, and a per-image update
      // on a big deck was enough on its own to make the app feel stuck.
      let lastProgressAt = 0;
      const onProgress = (next: DownloadProgress) => {
        const now = Date.now();
        if (next.done < next.total && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;
        setProgress(next);
      };
      await runSync({ mieId, teamId, onProgress });
      const meta = await getSyncMeta();
      setLastSyncedFor(meta.lastSyncedFor);
      setLastSyncedAt(meta.lastSyncedAt);
      setStatus('success');
      logSync('success');
      // A good moment to upload the usage queue: the network just worked.
      void flushUsage();
      // And to fetch this month's Analytics, so that screen works offline too.
      prefetchAnalytics(mieId);
      // Re-arm the day catch-up below. It used to stay spent after the first
      // success, so an app left open overnight never pulled the next day's
      // data and sat on yesterday's until it was restarted.
      autoSyncAttemptedRef.current = false;
    } catch (error) {
      console.warn('[sync] failed', error);
      setStatus('error');
      logSync('error', error);
    } finally {
      setProgress(null);
      runningRef.current = false;
    }
  }, [user, isAuthenticated]);

  const isStale = isHydrated && lastSyncedFor !== todayWorkday();
  const hasNoData = isHydrated && lastSyncedFor === null;

  // Sync once per user on login / app open when online — REGARDLESS of staleness.
  // The stale check alone can't refresh data whose SHAPE changed on the same
  // workday (e.g. after a backend deploy that adds columns), which otherwise
  // leaves the app rendering yesterday's cached rows all day. Image downloads are
  // skipped when already cached, so this is cheap when nothing new arrived. Also
  // covers "sync when the internet comes back" (re-runs when isOnline flips true).
  useEffect(() => {
    const uid = user?.userId != null ? String(user.userId) : null;
    if (!uid) {
      // Logged out — allow the next login to trigger a fresh sync.
      loginSyncedForRef.current = null;
      return;
    }
    if (!isHydrated || !isAuthenticated || !isOnline) return;
    if (!user?.mieId || !user?.teamId) return;
    if (loginSyncedForRef.current === uid) return;

    loginSyncedForRef.current = uid;
    void syncNow('login_or_open');
  }, [
    isHydrated,
    isAuthenticated,
    isOnline,
    user?.userId,
    user?.mieId,
    user?.teamId,
    syncNow,
  ]);

  // App-open catch-up + auto-sync on reconnect: if signed in and online but the
  // cached data isn't for today, sync. This is the real guarantee for a rep who
  // opens the app at 8 AM after the device was off all night.
  useEffect(() => {
    if (
      isHydrated &&
      isAuthenticated &&
      isOnline &&
      isStale &&
      status !== 'syncing' &&
      !autoSyncAttemptedRef.current
    ) {
      // Fire at most once until it succeeds or connectivity is regained, so a
      // failing sync (e.g. server unreachable) can't loop.
      autoSyncAttemptedRef.current = true;
      void syncNow('stale_catchup');
    }
  }, [isHydrated, isAuthenticated, isOnline, isStale, status, syncNow]);

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      progress,
      lastSyncedFor,
      lastSyncedAt,
      isOnline,
      isHydrated,
      isStale,
      hasNoData,
      syncNow,
    }),
    [
      status,
      progress,
      lastSyncedFor,
      lastSyncedAt,
      isOnline,
      isHydrated,
      isStale,
      hasNoData,
      syncNow,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return ctx;
}
