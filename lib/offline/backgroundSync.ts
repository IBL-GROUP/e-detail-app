import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { readStoredSession } from '@/providers/AuthProvider';
import { runSync } from '@/lib/offline/runSync';
import { getSyncMeta, todayWorkday } from '@/lib/offline/syncMeta';
import { flushUsageToDisk, recordUsageEvent } from '@/lib/usage/usageLog';
import {
  hasWorkingInternet,
  syncErrorCode,
  syncNetworkFields,
  syncSpeedFields,
  type SyncDownload,
} from '@/lib/usage/syncNetwork';

export const BACKGROUND_SYNC_TASK = 'e-detail-background-sync';

// Hint to the OS for how often the task may run (minutes). The OS decides the
// actual timing — overnight, on charger + WiFi, it tends to fire. A few hours
// keeps it eligible across the night; the "already synced today?" guard stops
// redundant work. The app-open catch-up remains the real guarantee.
const MINIMUM_INTERVAL_MINUTES = 6 * 60;

// Defined at module load (must be registered in global scope before the OS can
// invoke it — this file is imported early from the root layout).
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // Skip if we already have today's data.
    const meta = await getSyncMeta();
    if (meta.lastSyncedFor === todayWorkday()) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Need a signed-in rep with a team + MIE id to sync anything.
    const session = await readStoredSession();
    const user = session?.user ?? null;
    if (!session?.token || !user?.mieId || !user?.teamId) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // No working internet: nothing to sync with — not a sync, not logged. The
    // OS runs the task again later, and the app-open catch-up still covers it.
    // (No retry here, unlike the foreground: the OS gives a background task
    // little time, and a 10s wait would spend it.)
    if (!(await hasWorkingInternet())) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Logged for the usage report as an automatic sync. The event waits in the
    // on-device queue and is uploaded the next time the app is open and online.
    const startedAt = Date.now();
    // The connection as it starts and the speed of the day's data, as the
    // foreground sync records them (SyncProvider).
    const network = syncNetworkFields();
    let download: SyncDownload | null = null;
    const logSync = async (outcome: 'success' | 'error', error?: unknown) => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      return recordUsageEvent('sync', user, {
        trigger: 'auto',
        source: 'background',
        outcome,
        started_at: new Date(startedAt).toISOString(),
        seconds,
        error: error ? String((error as Error)?.message ?? error).slice(0, 300) : null,
        error_code: error ? syncErrorCode(error) : null,
        attempts: 1,
        ...(await network),
        ...syncSpeedFields(download),
      });
    };
    try {
      await runSync({ mieId: user.mieId, teamId: user.teamId, onDownload: (d) => { download = d; } });
    } catch (error) {
      await logSync('error', error);
      await flushUsageToDisk();
      throw error;
    }
    await logSync('success');
    // A headless run ends when this returns — write now, not after a delay.
    await flushUsageToDisk();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[bg-sync] failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Register the periodic background sync (idempotent). Call once on app start. */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      // Background execution disabled by the OS / user settings.
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SYNC_TASK,
    );
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
    }
  } catch (error) {
    console.warn('[bg-sync] registration failed', error);
  }
}
