import axios from '@/config/axios';
import { ApiEndpoints } from '@/api/endpoints';
import type { DoctorDataRow } from '@/api/doctor';
import type { ForcingContentRow, TeamBrand } from '@/api/content';
import type { SyncDownload } from '@/lib/usage/syncNetwork';

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

/** One bundled call that returns everything the rep needs for the day. */
export const getDailySync = async ({
  teamId,
  mieId,
  onDownload,
}: DailySyncParams): Promise<DailySyncResponse> => {
  const startedAt = Date.now();
  // Bytes received — the response interceptor hands back only the body, so the
  // size is taken on the way in (the server does not compress, so the body's
  // size is what came down):
  //   - while it downloads, from each progress event — so a download that
  //     fails part-way still has a size. React Native on Android reports
  //     `loaded` as 0 throughout (it reads the count once, before the body
  //     starts), so the text received so far is measured instead;
  //   - once it has all arrived, from the raw body before it is parsed.
  let bytes = 0;
  // When the first data arrived: the wait before it is the server building the
  // day's data plus the trip; the time after it, the connection alone.
  let firstDataAt: number | null = null;
  // The server's own build time, from its X-Sync-Build-Ms header.
  let serverMs: number | null = null;
  const parse = axios.defaults.transformResponse;
  try {
    return (await axios.get(ApiEndpoints.syncDaily, {
      params: { teamId, mieId },
      onDownloadProgress: (event) => {
        const request = (event.event as { target?: { responseText?: unknown } } | undefined)?.target;
        let soFar = 0;
        try {
          if (typeof request?.responseText === 'string') soFar = request.responseText.length;
        } catch {
          // responseText is not readable for this response type: use `loaded`.
        }
        bytes = Math.max(bytes, typeof event.loaded === 'number' ? event.loaded : 0, soFar);
        if (bytes > 0 && firstDataAt == null) firstDataAt = Date.now();
      },
      transformResponse: [
        (raw: unknown, headers?: unknown) => {
          if (typeof raw === 'string') bytes = Math.max(bytes, byteLength(raw));
          // No progress event came: it all arrived at once, just now.
          firstDataAt ??= Date.now();
          const built = Number((headers as { get?: (name: string) => unknown } | undefined)?.get?.('x-sync-build-ms'));
          if (Number.isFinite(built)) serverMs = built;
          return raw;
        },
        ...(Array.isArray(parse) ? parse : parse ? [parse] : []),
      ],
    })) as unknown as DailySyncResponse;
  } finally {
    const ms = Date.now() - startedAt;
    onDownload?.({ bytes, ms, waitMs: firstDataAt == null ? ms : firstDataAt - startedAt, serverMs });
  }
};
