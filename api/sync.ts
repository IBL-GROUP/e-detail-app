import axios from '@/config/axios';
import { ApiEndpoints } from '@/api/endpoints';
import type { DoctorDataRow } from '@/api/doctor';
import type { ForcingContentRow, TeamBrand } from '@/api/content';

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
  /**
   * Told the size of the day's data and how long it took — once it arrives, or
   * what had arrived when the request failed (nothing, when no answer came).
   */
  onDownload?: (download: { bytes: number; ms: number }) => void;
}

/** One bundled call that returns everything the rep needs for the day. */
export const getDailySync = async ({
  teamId,
  mieId,
  onDownload,
}: DailySyncParams): Promise<DailySyncResponse> => {
  const startedAt = Date.now();
  // Bytes received, as the download reports them — the response interceptor
  // hands back only the body, so the size is taken on the way in.
  let bytes = 0;
  try {
    return (await axios.get(ApiEndpoints.syncDaily, {
      params: { teamId, mieId },
      onDownloadProgress: (event) => {
        if (typeof event.loaded === 'number') bytes = event.loaded;
      },
    })) as unknown as DailySyncResponse;
  } finally {
    onDownload?.({ bytes, ms: Date.now() - startedAt });
  }
};
