import NetInfo from '@react-native-community/netinfo';

/**
 * What a sync ran on, for the usage report's "why do syncs fail" view: Wi-Fi
 * or mobile data, the mobile generation, the Wi-Fi signal, and whether the
 * internet actually answered — being connected to a network is not the same
 * as reaching the internet. Read at the start of the sync. Never throws: a
 * phone that cannot say is simply not recorded.
 */
export async function syncNetworkFields(): Promise<Record<string, string | number | null>> {
  try {
    const state = await NetInfo.fetch();
    const details = (state.details ?? {}) as { cellularGeneration?: string | null; strength?: number | null };
    return {
      net_type: state.type ?? null,
      net_gen: state.type === 'cellular' ? (details.cellularGeneration ?? null) : null,
      net_strength: state.type === 'wifi' && typeof details.strength === 'number' ? details.strength : null,
      net_reachable: state.isInternetReachable == null ? null : state.isInternetReachable ? 1 : 0,
    };
  } catch {
    return {};
  }
}

/**
 * Why a sync's request failed, as a code: "HTTP_410" when the server answered
 * with an error status, else axios's own — "ECONNABORTED" when the app gave up
 * waiting (timed out), "ERR_NETWORK" when nothing came back at all.
 */
export function syncErrorCode(error: unknown): string | null {
  const e = error as { code?: unknown; response?: { status?: unknown } } | null;
  if (typeof e?.response?.status === 'number') return `HTTP_${e.response.status}`;
  return typeof e?.code === 'string' ? e.code.slice(0, 40) : null;
}

/**
 * Whether the phone has internet that works: connected, and not known to be
 * cut off. "Unknown" counts as yes — NetInfo often has not checked yet when
 * the app opens, and saying no then would skip a sync that would have worked.
 * Every sync asks this first — auto and manual: in Oct 2026, ~900 were started
 * on a phone with no connection and could only fail.
 */
export async function hasWorkingInternet(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected) && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/**
 * A failure worth one more try: the request got no answer or timed out — a
 * weak signal often clears in seconds. An answer from the server (401, 410…)
 * would only come back the same, and an app error is not the network.
 */
export function isRetryableSyncError(error: unknown): boolean {
  const e = error as { response?: unknown; isAxiosError?: unknown; code?: unknown } | null;
  if (!e || e.response) return false;
  return e.isAxiosError === true || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED';
}

/** The wait before that one retry. */
export const SYNC_RETRY_DELAY_MS = 10_000;

/**
 * How the day's data came down — for a failed sync, as far as it got:
 *   bytes     what arrived
 *   ms        request sent → done (or failed)
 *   waitMs    request sent → first data: the server building it plus the trip
 *             (all of `ms` when no data came at all)
 *   serverMs  the server's own build time, from its header (null when no
 *             answer came)
 */
export interface SyncDownload {
  bytes: number;
  ms: number;
  waitMs: number;
  serverMs: number | null;
}

/** Below this the download is too short to time on its own. */
const MIN_TIMED_DOWNLOAD_MS = 200;

export function syncSpeedFields(download: SyncDownload | null | undefined): Record<string, number | null> {
  if (!download || download.bytes < 0 || download.ms <= 0) return {};
  // The connection's speed: what arrived ÷ the time it took to arrive, from
  // the first data on — the server's build time left out, so a slow server
  // does not read as a slow connection. A download too quick to time is
  // measured over the whole request. Nothing arrived before it failed: 0.
  const downloadMs = download.ms - download.waitMs;
  const timedMs = downloadMs >= MIN_TIMED_DOWNLOAD_MS ? downloadMs : download.ms;
  return {
    bytes: download.bytes,
    download_ms: downloadMs,
    wait_ms: download.waitMs,
    server_ms: download.serverMs,
    // bits ÷ milliseconds = kilobits a second.
    kbps: Math.round((download.bytes * 8) / timedMs),
  };
}
