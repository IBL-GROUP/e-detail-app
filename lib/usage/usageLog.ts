import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { afterInteractions } from '@/lib/afterInteractions';

import axios from '@/config/axios';
import { getAccessToken, isOfflineSessionToken } from '@/lib/auth/tokenStore';
import { APP_VERSION_WITH_BUILD } from '@/lib/appVersion';

/**
 * How the app is used — time open, per screen, online vs offline, syncs and
 * sign-ins — for the usage report on the backend (/access/app-usage).
 *
 * The app is offline-first, so nothing here talks to the server as it happens.
 * Events are queued on the device and uploaded in batches (flushUsage) once
 * there is a network and a real server token; the backend writes one line per
 * event to logs/app-usage.log.
 *
 * Time is measured as SPANS — the app in the foreground, one screen, one
 * online/offline stretch. A span is written when it ends. Open spans are
 * checkpointed every 30s (checkpointSpans), so if the app is swiped away or
 * crashes, the next launch closes them at the last checkpoint
 * (recoverOpenSpans, ended_reason "app_killed") instead of losing the time.
 *
 * Everything goes through one serial queue (run) so a span cannot be opened
 * before the one it replaces is closed, whatever order React fires effects in.
 */

export type SpanKind = 'app' | 'screen' | 'network';
export type UsageEventType = 'app_session' | 'screen' | 'network' | 'sync' | 'login' | 'logout';

/** The rep an event belongs to — a snapshot, since the queue can outlive a session. */
export interface UsageUser {
  userId: number | string;
  username: string;
  name?: string;
  mieId?: string;
  teamId?: number;
}

interface UsageEvent {
  id: string;
  type: UsageEventType;
  at: string;
  [field: string]: string | number | null | undefined;
}

interface OpenSpan {
  key: string;
  startedAt: string;
  lastSeenAt: string;
  user: UsageUser;
  /** Screen spans only: the bottom tab the screen was reached from. */
  tab?: string;
  /**
   * App spans only: battery when the app came to the screen, and the latest
   * reading since (refreshed at each checkpoint) — what a span cut short by the
   * app being killed ends on.
   */
  batteryStart?: BatteryReading;
  batteryLast?: BatteryReading;
}

interface BatteryReading {
  /** 0-100, or null when the phone will not say. */
  level: number | null;
  charging: boolean | null;
}

/**
 * Battery level and whether it is charging. Read only at the edges of an app
 * span (and the 30s checkpoint) — never polled — so measuring the battery does
 * not drain it. Never throws: a phone that cannot tell gives nulls.
 */
async function readBattery(): Promise<BatteryReading> {
  try {
    const power = await Battery.getPowerStateAsync();
    const level = power.batteryLevel >= 0 ? Math.round(power.batteryLevel * 100) : null;
    const charging =
      power.batteryState === Battery.BatteryState.CHARGING ||
      power.batteryState === Battery.BatteryState.FULL
        ? true
        : power.batteryState === Battery.BatteryState.UNPLUGGED
          ? false
          : null;
    return { level, charging };
  } catch {
    return { level: null, charging: null };
  }
}

const flag = (value: boolean | null | undefined) => (value == null ? null : value ? 1 : 0);

interface StoredUsage {
  deviceId: string;
  events: UsageEvent[];
  open: Partial<Record<SpanKind, OpenSpan>>;
}

const STORAGE_KEY = 'e_detail_usage_log';
const fileUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}e-detail-usage-log.json`
  : null;

/** Oldest events are dropped past this — a phone offline for weeks must not fill up. */
const MAX_QUEUED_EVENTS = 5000;
/** Events per upload. The server accepts up to 500. */
const BATCH_SIZE = 200;
/** A span shorter than this is a flicker (a re-render, a quick transition), not usage. */
const MIN_SPAN_SECONDS = 1;
/**
 * How long changes sit in memory before they are written. Every screen change
 * ends one span and starts another, and writing the whole queue to disk right
 * then — on the JS thread, mid-navigation — put a visible delay on every tap,
 * worst offline, where the queue only grows. Writes are now batched and run
 * after the transition; going to the background writes at once (flushUsageToDisk).
 */
const SAVE_DELAY_MS = 3_000;

const SPAN_EVENT: Record<SpanKind, UsageEventType> = {
  app: 'app_session',
  screen: 'screen',
  network: 'network',
};

let state: StoredUsage | null = null;
let chain: Promise<unknown> = Promise.resolve();
let flushing = false;

/** Runs `task` after every task queued before it, and never rejects the chain. */
function run<T>(task: () => Promise<T>): Promise<T | undefined> {
  const next = chain.then(task).catch((error) => {
    console.warn('[usage] task failed', error);
    return undefined;
  });
  chain = next;
  return next;
}

async function readStored(): Promise<StoredUsage | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      return raw ? (JSON.parse(raw) as StoredUsage) : null;
    }
    if (!fileUri) return null;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return raw ? (JSON.parse(raw) as StoredUsage) : null;
  } catch (error) {
    console.warn('[usage] could not read the usage queue — starting a new one', error);
    return null;
  }
}

async function load(): Promise<StoredUsage> {
  if (state) return state;
  const stored = await readStored();
  state = {
    deviceId: stored?.deviceId || Crypto.randomUUID(),
    events: Array.isArray(stored?.events) ? stored.events : [],
    open: stored?.open ?? {},
  };
  return state;
}

async function save(): Promise<void> {
  if (!state) return;
  const raw = JSON.stringify(state);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, raw);
    return;
  }
  if (fileUri) await FileSystem.writeAsStringAsync(fileUri, raw);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Writes the queue a little later, once — however many changes land in the
 * meantime — and only after any running transition has finished.
 */
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // Idle UI, or 1.5s at the latest — the write is never postponed for good.
    afterInteractions(() => {
      void run(save);
    });
  }, SAVE_DELAY_MS);
}

/**
 * Writes now. For the moments the app may not get another chance: going to the
 * background, and the end of the headless background sync.
 */
export function flushUsageToDisk(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return run(save).then(() => undefined);
}

function userFields(user: UsageUser) {
  return {
    user_id: String(user.userId),
    user_name: user.username,
    display_name: user.name ?? null,
    mie_id: user.mieId ?? null,
    team_id: user.teamId != null ? String(user.teamId) : null,
  };
}

function push(store: StoredUsage, event: Omit<UsageEvent, 'id'>) {
  store.events.push({ id: Crypto.randomUUID(), ...event } as UsageEvent);
  if (store.events.length > MAX_QUEUED_EVENTS) {
    store.events.splice(0, store.events.length - MAX_QUEUED_EVENTS);
  }
}

function closeInto(
  store: StoredUsage,
  kind: SpanKind,
  endedAt: string,
  reason: string,
  batteryEnd?: BatteryReading,
) {
  const span = store.open[kind];
  if (!span) return;
  delete store.open[kind];

  const seconds = Math.round((Date.parse(endedAt) - Date.parse(span.startedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds < MIN_SPAN_SECONDS) return;

  push(store, {
    type: SPAN_EVENT[kind],
    at: span.startedAt,
    started_at: span.startedAt,
    ended_at: endedAt,
    seconds,
    ...(kind === 'screen' ? { screen: span.key, tab: span.tab ?? null } : {}),
    ...(kind === 'app'
      ? {
          battery_start: span.batteryStart?.level ?? null,
          charging_start: flag(span.batteryStart?.charging),
          battery_end: (batteryEnd ?? span.batteryLast)?.level ?? null,
          charging_end: flag((batteryEnd ?? span.batteryLast)?.charging),
        }
      : {}),
    ...(kind === 'network' ? { state: span.key } : {}),
    ended_reason: reason,
    ...userFields(span.user),
  });
}

/** A one-off event: a sync, a sign-in, a sign-out. */
export function recordUsageEvent(
  type: Exclude<UsageEventType, 'app_session' | 'screen' | 'network'>,
  user: UsageUser | null | undefined,
  fields: Record<string, string | number | null | undefined> = {},
): Promise<void> {
  return run(async () => {
    if (!user) return;
    const store = await load();
    push(store, { type, at: new Date().toISOString(), ...userFields(user), ...fields });
    scheduleSave();
  }).then(() => undefined);
}

/**
 * Starts a span, closing the open one of the same kind first. Opening the span
 * that is already open (same key, same rep) is a no-op, so re-renders are free.
 */
export function openSpan(
  kind: SpanKind,
  key: string,
  user: UsageUser,
  tab?: string,
): Promise<void> {
  return run(async () => {
    const store = await load();
    const current = store.open[kind];
    if (
      current &&
      current.key === key &&
      current.tab === tab &&
      String(current.user.userId) === String(user.userId)
    ) {
      return;
    }
    const now = new Date().toISOString();
    const battery = kind === 'app' ? await readBattery() : undefined;
    closeInto(store, kind, now, 'switched', battery);
    store.open[kind] = {
      key,
      startedAt: now,
      lastSeenAt: now,
      user,
      tab,
      ...(battery ? { batteryStart: battery, batteryLast: battery } : {}),
    };
    scheduleSave();
  }).then(() => undefined);
}

export function closeSpan(kind: SpanKind, reason: string): Promise<void> {
  return run(async () => {
    const store = await load();
    if (!store.open[kind]) return;
    const battery = kind === 'app' ? await readBattery() : undefined;
    closeInto(store, kind, new Date().toISOString(), reason, battery);
    scheduleSave();
  }).then(() => undefined);
}

/** Moves every open span's "still here at" mark to now. Called every 30s. */
export function checkpointSpans(): Promise<void> {
  return run(async () => {
    const store = await load();
    const now = new Date().toISOString();
    let changed = false;
    for (const span of Object.values(store.open)) {
      if (span) {
        span.lastSeenAt = now;
        changed = true;
      }
    }
    if (store.open.app) store.open.app.batteryLast = await readBattery();
    if (changed) scheduleSave();
  }).then(() => undefined);
}

/**
 * On launch: spans still open in storage belong to a previous run that never
 * closed them (swiped away, crashed, phone died). Close each at its last
 * checkpoint so its time counts, marked app_killed.
 */
export function recoverOpenSpans(): Promise<void> {
  return run(async () => {
    const store = await load();
    const kinds = Object.keys(store.open) as SpanKind[];
    if (kinds.length === 0) return;
    for (const kind of kinds) {
      const span = store.open[kind];
      if (span) closeInto(store, kind, span.lastSeenAt, 'app_killed');
    }
    await save();
  }).then(() => undefined);
}

/**
 * Uploads the queue in batches. Needs a real server token — an offline
 * session's placeholder is refused by the API — so it quietly waits for one.
 * An upload whose answer never arrives is simply sent again next time; the
 * server de-duplicates by event id.
 */
export async function flushUsage(): Promise<void> {
  if (flushing) return;
  const token = getAccessToken();
  if (!token || isOfflineSessionToken(token)) return;

  flushing = true;
  try {
    for (let round = 0; round < 10; round += 1) {
      const store = await run(load);
      const batch = store?.events.slice(0, BATCH_SIZE) ?? [];
      if (!store || batch.length === 0) return;

      await axios.post('/usage/app-events', {
        device: {
          device_id: store.deviceId,
          platform: Platform.OS,
          os_version: String(Platform.Version ?? ''),
          app_version: APP_VERSION_WITH_BUILD,
        },
        events: batch,
      });

      const sent = new Set(batch.map((event) => event.id));
      await run(async () => {
        const current = await load();
        current.events = current.events.filter((event) => !sent.has(event.id));
        // Deferred like the rest; if the app dies first, the batch is just sent
        // again and the server drops the duplicates by id.
        scheduleSave();
      });
    }
  } catch (error) {
    // Offline, server down, token expired — keep everything for next time.
    console.log('[usage] upload postponed', (error as Error)?.message ?? error);
  } finally {
    flushing = false;
  }
}

/**
 * The four bottom tabs. Every other screen is reached FROM one of them, and its
 * time counts towards that tab — Content opened from Home is Home time, a call
 * started from e-Detailing is e-Detailing time.
 */
export const MAIN_TABS = new Set(['home', 'e_detailing', 'analytics', 'settings']);

/**
 * Views INSIDE a screen that the route cannot see — Analytics switches between
 * Call Performance and Sales Performance with a toggle, not a navigation. The
 * screen reports its current view here, and the tracker files the time as
 * e.g. "analytics_call" / "analytics_sales" (still under the Analytics tab).
 */
const screenViews = new Map<string, string>();
const viewListeners = new Set<() => void>();

export function setScreenView(screen: string, view: string | null): void {
  if (view) screenViews.set(screen, view);
  else screenViews.delete(screen);
  viewListeners.forEach((listener) => listener());
}

export function getScreenView(screen: string): string | undefined {
  return screenViews.get(screen);
}

export function subscribeScreenViews(listener: () => void): () => void {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

/** Route path -> the screen name the report uses. */
export function screenKeyForPath(pathname: string | null | undefined): string {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index') return 'home';
  const first = path.split('/')[1] ?? '';
  switch (first) {
    case 'planned-calls':
      return 'e_detailing';
    case 'unplanned-calls':
      return 'unplanned_calls';
    case 'analytics':
      return 'analytics';
    case 'settings':
      return 'settings';
    case 'doctor-list':
      return 'doctors';
    case 'doctor':
      return 'doctor_detail';
    case 'content-library':
      return 'content';
    case 'my-brands':
      return 'portfolio';
    case 'patients':
      return 'patients';
    case 'call':
      return 'call';
    case 'call-analytics':
      return 'call_analytics';
    case 'ai-trainer':
      return 'ai_trainer';
    case 'faqs':
      return 'faqs';
    case 'login':
      return 'login';
    default:
      return 'other';
  }
}
