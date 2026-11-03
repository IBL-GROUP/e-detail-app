import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Platform } from 'react-native';

import { flushUsageToDisk, recordUsageEvent, type UsageUser } from '@/lib/usage/usageLog';

/**
 * Crash reports, carried to the server by the usage log as "crash" events and
 * listed on the report's Crashes tab (/access/app-usage).
 *
 * Two kinds of ending are caught:
 *
 *   js_fatal / js_error  a JavaScript error reached the global handler. A fatal
 *                        one is about to close the app, so it is written to the
 *                        run marker (one small file, written at once) and
 *                        reported on the next launch; a non-fatal one goes
 *                        straight into the usage queue.
 *
 *   unexpected_exit      the app was on screen and simply stopped — no
 *                        JavaScript error, so a native crash, Android closing
 *                        it for memory, or the phone switching off. Nothing
 *                        runs at that moment, so it is found on the NEXT
 *                        launch: the marker still says "in the foreground".
 *                        Swiping the app away or Android closing it in the
 *                        background are not reported — the app has gone to
 *                        the background first, and the marker says so.
 *
 * The marker also holds the screen, the rep and the last moment the app was
 * known to be alive (screen changes and a 30s heartbeat), so a report says
 * where the rep was when it happened.
 */

interface PendingCrash {
  kind: 'js_fatal';
  at: string;
  message: string;
  stack: string | null;
}

interface RunMarker {
  runId: string;
  startedAt: string;
  lastSeenAt: string;
  foreground: boolean;
  screen: string | null;
  user: UsageUser | null;
  battery: number | null;
  /** A fatal JS error this run: its end is already explained, not "unexpected". */
  crashes: PendingCrash[];
}

const fileUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}e-detail-run-marker.json`
  : null;
/** Non-fatal errors reported per run — a render loop must not flood the queue. */
const MAX_NON_FATAL_PER_RUN = 20;
/** How long a fatal error may hold the app open while its report is written. */
const FATAL_WRITE_TIMEOUT_MS = 1_500;

let marker: RunMarker | null = null;
/** The tracker's latest report — it can arrive before the marker is read on launch. */
let latest: { user: UsageUser | null; screen: string; foreground: boolean } | null = null;
let chain: Promise<unknown> = Promise.resolve();
let nonFatalCount = 0;
let installed = false;
/** Reports from the previous run still waiting for a rep to file them under. */
let waiting: { user: UsageUser | null; fields: Record<string, string | number | null> }[] = [];

function serial(task: () => Promise<void>): Promise<void> {
  const next = chain.then(task).catch((error) => console.warn('[crash] marker task failed', error));
  chain = next;
  return next;
}

async function readMarker(): Promise<RunMarker | null> {
  if (!fileUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(fileUri)) as RunMarker;
  } catch {
    return null;
  }
}

function writeMarker(): Promise<void> {
  return serial(async () => {
    if (!fileUri || !marker) return;
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(marker));
  });
}

const errorText = (error: unknown) => ({
  message: String((error as Error)?.message ?? error ?? 'Unknown error').slice(0, 1000),
  stack: (error as Error)?.stack ? String((error as Error).stack).slice(0, 4000) : null,
});

const secondsBetween = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));

/** Files the previous run's reports, under its rep — or, if it had none yet, the next one. */
async function fileWaiting(fallback: UsageUser | null): Promise<void> {
  const ready = waiting.filter((report) => report.user ?? fallback);
  if (ready.length === 0) return;
  waiting = waiting.filter((report) => !(report.user ?? fallback));
  for (const report of ready) {
    await recordUsageEvent('crash', report.user ?? fallback, report.fields);
  }
  await flushUsageToDisk();
}

/** Reads what the previous run left behind, then starts this run's marker. */
function startRun(): Promise<void> {
  return serial(async () => {
    const previous = await readMarker();
    if (previous) {
      const base = {
        run_id: previous.runId,
        started_at: previous.startedAt,
        screen: previous.screen,
      };
      for (const crash of previous.crashes ?? []) {
        waiting.push({
          user: previous.user,
          fields: {
            ...base,
            at: crash.at,
            ended_at: crash.at,
            seconds: secondsBetween(previous.startedAt, crash.at),
            crash_kind: crash.kind,
            message: crash.message,
            stack: crash.stack,
          },
        });
      }
      // A development reload also ends a run "on screen" — not a crash.
      if (previous.foreground && (previous.crashes ?? []).length === 0 && !__DEV__) {
        waiting.push({
          user: previous.user,
          fields: {
            ...base,
            at: previous.lastSeenAt,
            ended_at: previous.lastSeenAt,
            seconds: secondsBetween(previous.startedAt, previous.lastSeenAt),
            crash_kind: 'unexpected_exit',
            battery_end: previous.battery,
          },
        });
      }
    }

    const now = new Date().toISOString();
    marker = {
      runId: Crypto.randomUUID(),
      startedAt: now,
      lastSeenAt: now,
      // Not "on screen" until something says so: the overnight background sync
      // loads this module too, with no screen at all, and a run it leaves behind
      // must not read as the app closing unexpectedly. The usage tracker marks
      // the run on screen as soon as the app is.
      foreground: latest?.foreground ?? AppState.currentState === 'active',
      screen: latest?.screen ?? null,
      user: latest?.user ?? previous?.user ?? null,
      battery: null,
      crashes: [],
    };
    if (fileUri) await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(marker));
  }).then(() => fileWaiting(latest?.user ?? null));
}

function onFatal(error: unknown): Promise<void> {
  if (!marker) return Promise.resolve();
  marker.crashes.push({ kind: 'js_fatal', at: new Date().toISOString(), ...errorText(error) });
  return writeMarker();
}

function onNonFatal(error: unknown): void {
  if (nonFatalCount >= MAX_NON_FATAL_PER_RUN || !marker?.user) return;
  nonFatalCount += 1;
  const now = new Date().toISOString();
  void recordUsageEvent('crash', marker.user, {
    at: now,
    ended_at: now,
    started_at: marker.startedAt,
    seconds: secondsBetween(marker.startedAt, now),
    run_id: marker.runId,
    screen: marker.screen,
    crash_kind: 'js_error',
    ...errorText(error),
  });
}

/**
 * Installs the global JavaScript error handler and starts this run's marker.
 * Call once, as early as possible (module scope of the root layout).
 */
export function installCrashReporting(): void {
  if (installed || Platform.OS === 'web') return;
  installed = true;

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      onNonFatal(error);
      previousHandler(error, isFatal);
      return;
    }
    // Let the report reach the disk before React Native closes the app — but
    // never hold the app open on a write that does not finish.
    let handedOn = false;
    const handOn = () => {
      if (handedOn) return;
      handedOn = true;
      previousHandler(error, isFatal);
    };
    void onFatal(error).finally(handOn);
    setTimeout(handOn, FATAL_WRITE_TIMEOUT_MS);
  });

  void startRun();
}

/**
 * What the app is doing now: the rep, the screen, and whether it is on screen.
 * Called by the usage tracker whenever one of them changes.
 */
export function noteRunState(next: {
  user: UsageUser | null;
  screen: string;
  foreground: boolean;
}): void {
  latest = next;
  if (!marker) return;
  marker.user = next.user ?? marker.user;
  marker.screen = next.screen;
  marker.foreground = next.foreground;
  marker.lastSeenAt = new Date().toISOString();
  void writeMarker();
  if (next.user) void fileWaiting(next.user);
}

/** The 30s heartbeat while on screen: still alive, and the battery now. */
export async function noteAlive(): Promise<void> {
  if (!marker) return;
  marker.lastSeenAt = new Date().toISOString();
  try {
    const level = await Battery.getBatteryLevelAsync();
    marker.battery = level >= 0 ? Math.round(level * 100) : null;
  } catch {
    // A phone that will not say keeps the last reading.
  }
  await writeMarker();
}
