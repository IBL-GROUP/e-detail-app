import axios from '@/config/axios';
import { ApiEndpoints } from '@/api/endpoints';
import type { DoctorDataRow } from '@/api/doctor';
import type { ForcingContentRow, TeamBrand } from '@/api/content';
import { syncErrorCode, type SyncDownload } from '@/lib/usage/syncNetwork';

export interface DailySyncResponse {
  success: boolean;
  workdayDate: string; // server-authoritative workday (YYYY-MM-DD)
  teamId: number;
  mieId: number;
  doctors: DoctorDataRow[];
  // The team's full doctor pool for offline unplanned calls.
  unplannedDoctors: DoctorDataRow[];
  // The team's SKUs, for the "Samples Provided" picker.
  teamSkus: string[];
  // The team's brands + their SKUs, for the Content Viewing screen.
  teamBrands: TeamBrand[];
  // Forcing rows keyed by doctorId (matched server-side to the doctor's specialties).
  forcing: Record<string, ForcingContentRow[]>;
  imageUrls: string[];
}

interface DailySyncParams {
  teamId: number;
  mieId: string;
  /** Told how the download went — once it arrives, or when the request fails. */
  onDownload?: (download: SyncDownload) => void;
}

/** The UTF-8 size of a response body (its string length when there is no TextEncoder). */
function byteLength(text: string): number {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length;
}

/**
 * How long the day's data may take. Not one fixed limit: a phone with no
 * internet should hear "failed" within a minute, while a slow but working one
 * should be allowed to finish.
 *   FIRST_DATA_MS  the server builds the data, then it starts arriving
 *   STALL_MS       once it is arriving, this long with nothing new = dead
 *   MAX_MS         the whole download, while it keeps arriving
 * It used to be 30s for everything, so a ~3 MB day on ordinary 4G could never
 * finish — and every second the server spent building came off that 30s.
 */
const FIRST_DATA_MS = 60_000;
const STALL_MS = 30_000;
const MAX_MS = 5 * 60_000;

type ProgressRequest = { responseText?: unknown; getResponseHeader?: (name: string) => string | null };
const headerNumber = (value: unknown) => {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** One bundled call that returns everything the rep needs for the day. */
export const getDailySync = async ({
  teamId,
  mieId,
  onDownload,
}: DailySyncParams): Promise<DailySyncResponse> => {
  const startedAt = Date.now();
  // The day's data as the phone sees it — unpacked. The response interceptor
  // hands back only the body, so it is measured on the way in: while it
  // downloads, from each progress event (so a download that fails part-way
  // still has a size; React Native on Android reports `loaded` as 0
  // throughout — it reads the count once, before the body starts — so the text
  // received so far is measured instead), and at the end from the raw body.
  let unpacked = 0;
  // The server gzips the day's data; it says how big it was before and after
  // (X-Sync-Raw-Bytes / X-Sync-Wire-Bytes). The speed logged is what crossed
  // the network, so what arrived is scaled to the packed size.
  let packedRatio: number | null = null;
  let wireBytes: number | null = null;
  // When the first data arrived: the wait before it is the server building the
  // day's data plus the trip; the time after it, the connection alone.
  let firstDataAt: number | null = null;
  let lastDataAt = startedAt;
  // The server's own build time, from its X-Sync-Build-Ms header.
  let serverMs: number | null = null;
  const readSizes = (get: (name: string) => unknown) => {
    const raw = headerNumber(get('x-sync-raw-bytes'));
    const wire = headerNumber(get('x-sync-wire-bytes'));
    if (raw && wire) packedRatio = wire / raw;
  };

  // Gives up on the limits above. axios's own `timeout` covers only the total.
  const controller = new AbortController();
  let gaveUp: string | null = null;
  const watchdog = setInterval(() => {
    const now = Date.now();
    if (firstDataAt == null && now - startedAt > FIRST_DATA_MS) gaveUp = `no data for ${FIRST_DATA_MS / 1000}s`;
    else if (firstDataAt != null && now - lastDataAt > STALL_MS) gaveUp = `no new data for ${STALL_MS / 1000}s`;
    if (gaveUp) controller.abort();
  }, 1000);

  const parse = axios.defaults.transformResponse;
  try {
    return (await axios.get(ApiEndpoints.syncDaily, {
      params: { teamId, mieId },
      timeout: MAX_MS,
      signal: controller.signal,
      onDownloadProgress: (event) => {
        const request = (event.event as { target?: ProgressRequest } | undefined)?.target;
        let soFar = 0;
        try {
          if (typeof request?.responseText === 'string') soFar = request.responseText.length;
          if (packedRatio == null && request?.getResponseHeader) readSizes((name) => request.getResponseHeader?.(name));
        } catch {
          // Not readable for this response type: use `loaded`.
        }
        const next = Math.max(unpacked, typeof event.loaded === 'number' ? event.loaded : 0, soFar);
        if (next > unpacked) lastDataAt = Date.now();
        unpacked = next;
        if (unpacked > 0 && firstDataAt == null) firstDataAt = Date.now();
      },
      transformResponse: [
        (raw: unknown, headers?: unknown) => {
          if (typeof raw === 'string') unpacked = Math.max(unpacked, byteLength(raw));
          // No progress event came: it all arrived at once, just now.
          firstDataAt ??= Date.now();
          const get = (name: string) => (headers as { get?: (name: string) => unknown } | undefined)?.get?.(name);
          const built = get('x-sync-build-ms');
          if (built != null && built !== '' && Number.isFinite(Number(built))) serverMs = Number(built);
          wireBytes = headerNumber(get('x-sync-wire-bytes'));
          readSizes(get);
          return raw;
        },
        ...(Array.isArray(parse) ? parse : parse ? [parse] : []),
      ],
    })) as unknown as DailySyncResponse;
  } catch (error) {
    // Given up by the watchdog: reported as the timeout it is, so it is logged
    // as "timed out" and tried once more like any other.
    if (gaveUp) throw Object.assign(new Error(`timeout: ${gaveUp}`), { code: 'ECONNABORTED', isAxiosError: true });
    throw error;
  } finally {
    clearInterval(watchdog);
    const ms = Date.now() - startedAt;
    const bytes = wireBytes ?? Math.round(unpacked * (packedRatio ?? 1));
    onDownload?.({ bytes, ms, waitMs: firstDataAt == null ? ms : firstDataAt - startedAt, serverMs });
  }
};

/** The speed test is small, so a slow connection still finishes it in time. */
const SPEEDTEST_TIMEOUT_MS = 15_000;

/**
 * The phone's own internet speed, for a sync that failed: a fixed 256 KB the
 * server answers from memory (GET /sync/speedtest), never waiting on its
 * database — so a busy server does not read as a slow phone. Timed from the
 * first data, as the day's data is. Never throws: the result is log fields —
 * probe_kbps (0 when nothing came), and probe_error when it failed too, i.e.
 * the phone had no working internet.
 */
export async function measurePhoneSpeed(): Promise<Record<string, number | string>> {
  const startedAt = Date.now();
  let bytes = 0;
  let firstDataAt: number | null = null;
  let failure: unknown = null;
  try {
    await axios.get(ApiEndpoints.syncSpeedtest, {
      timeout: SPEEDTEST_TIMEOUT_MS,
      onDownloadProgress: (event) => {
        const request = (event.event as { target?: { responseText?: unknown } } | undefined)?.target;
        let soFar = 0;
        try {
          if (typeof request?.responseText === 'string') soFar = request.responseText.length;
        } catch {
          // Not readable for this response type: use `loaded`.
        }
        bytes = Math.max(bytes, typeof event.loaded === 'number' ? event.loaded : 0, soFar);
        if (bytes > 0 && firstDataAt == null) firstDataAt = Date.now();
      },
      // Measured, not kept: nothing to parse.
      transformResponse: [
        (raw: unknown) => {
          if (typeof raw === 'string') bytes = Math.max(bytes, byteLength(raw));
          firstDataAt ??= Date.now();
          return null;
        },
      ],
    });
  } catch (error) {
    failure = error;
  }
  const ms = Date.now() - startedAt;
  const downloadMs = firstDataAt == null ? ms : ms - (firstDataAt - startedAt);
  const timedMs = downloadMs >= 200 ? downloadMs : ms;
  return {
    probe_kbps: Math.round((bytes * 8) / Math.max(timedMs, 1)),
    probe_bytes: bytes,
    probe_ms: ms,
    ...(failure ? { probe_error: syncErrorCode(failure) ?? 'FAILED' } : {}),
  };
}
