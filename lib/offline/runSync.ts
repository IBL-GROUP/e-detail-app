import { persistQueryClientSave } from '@tanstack/react-query-persist-client';

import { queryClient } from '@/providers/QueryProvider';
import { filePersister, CACHE_BUSTER } from '@/lib/offline/persister';
import {
  plannedDoctorsKey,
  doctorsKey,
  type DoctorDataResponse,
} from '@/api/doctor';
import {
  forcingContentKey,
  forcingImageUrls,
  teamBrandsKey,
  type ForcingContentResponse,
} from '@/api/content';
import { getDailySync } from '@/api/sync';
import { teamSkusKey } from '@/api/sku';
import { syncImages, loadImageManifest, type DownloadProgress } from './imageCache';
import { setSyncMeta } from './syncMeta';

export interface RunSyncParams {
  mieId: string;
  teamId: number;
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * The actual sync work, usable from both the React SyncProvider (foreground /
 * catch-up) and the headless background task.
 *
 * Makes ONE bundled `/sync/daily` call, seeds the React Query cache under the
 * exact keys the screens already use (so the app renders from cache offline
 * with no screen changes), downloads the slide images, force-persists the
 * cache, and stamps the server-authoritative workday.
 */
export async function runSync({
  mieId,
  teamId,
  onProgress,
}: RunSyncParams): Promise<void> {
  await loadImageManifest();

  const payload = await getDailySync({ teamId, mieId });

  // 1) Seed the planned-doctors infinite query (one page with the full set).
  const doctorsPage: DoctorDataResponse = {
    success: true,
    count: payload.doctors.length,
    totalCount: payload.doctors.length,
    offset: 0,
    limit: payload.doctors.length,
    hasMore: false,
    data: payload.doctors,
  };
  queryClient.setQueryData(plannedDoctorsKey(teamId, mieId, undefined), {
    pages: [doctorsPage],
    pageParams: [0],
  });

  // Seed the team's unplanned doctor pool (default, no-search key) so the
  // Unplanned tab works offline too.
  const unplannedPage: DoctorDataResponse = {
    success: true,
    count: payload.unplannedDoctors.length,
    totalCount: payload.unplannedDoctors.length,
    offset: 0,
    limit: payload.unplannedDoctors.length,
    hasMore: false,
    data: payload.unplannedDoctors,
  };
  queryClient.setQueryData(doctorsKey(teamId, undefined, undefined), {
    pages: [unplannedPage],
    pageParams: [0],
  });

  // Seed the team's SKUs for the call summary "Samples Provided" picker.
  queryClient.setQueryData(teamSkusKey(teamId), payload.teamSkus ?? []);

  // Seed the team's brands + SKUs for the Content Viewing screen.
  queryClient.setQueryData(teamBrandsKey(teamId), payload.teamBrands ?? []);

  // 2) Seed each doctor's forcing query + collect the image URLs (as the slides
  //    will request them, so the cached file keys match). Forcing is keyed by
  //    doctorId (matched server-side against the doctor's specialties).
  const imageUrls: string[] = [];
  for (const [doctorId, rows] of Object.entries(payload.forcing)) {
    const response: ForcingContentResponse = {
      success: true,
      count: rows.length,
      teamId,
      doctorId,
      data: rows,
    };
    // mieId must be in this key, and must match what the call screen asks for:
    // it is part of the live query key now, so seeding without it would file the
    // offline deck under a key nothing ever reads — leaving a rep with no slides
    // the moment they lose signal.
    queryClient.setQueryData(
      forcingContentKey(teamId, doctorId, undefined, mieId),
      response,
    );
    imageUrls.push(...forcingImageUrls(response));
  }

  // 3) Download the slide images for offline playback.
  await syncImages([...new Set(imageUrls)], onProgress);

  // 4) Persist the seeded cache (provider auto-persist doesn't run headless),
  //    then stamp the server's workday.
  await persistQueryClientSave({
    queryClient,
    persister: filePersister,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === 'success',
    },
  });

  await setSyncMeta({
    lastSyncedFor: payload.workdayDate,
    lastSyncedAt: new Date().toISOString(),
  });
}
