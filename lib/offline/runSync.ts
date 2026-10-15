import { notifyManager } from '@tanstack/react-query';
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
  normalizeTeamBrands,
  teamBrandImageUrls,
  teamBrandsKey,
  type ForcingContentResponse,
} from '@/api/content';
import { getDailySync } from '@/api/sync';
import { teamSkusKey } from '@/api/sku';
import { syncImages, loadImageManifest, type DownloadProgress } from './imageCache';
import { setSyncMeta } from './syncMeta';

/**
 * Gives the UI thread one turn. Sync runs on the same JS thread as the screen,
 * so between its heavy steps it steps aside and lets pending taps through.
 */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

  // Let the screen handle any tap that queued during the download above before
  // the heavy part starts.
  await yieldToUi();

  // ALL the seeding below happens in ONE notification batch. Each setQueryData
  // otherwise tells the cache's listeners on its own — and the persister that
  // saves the cache to disk re-packs the WHOLE cache on every one. With a deck
  // per doctor that was hundreds of full re-packs back to back, which held the
  // JS thread long enough for taps anywhere in the app to go dead mid-sync.
  // Batched, the listeners hear once, at the end.
  const imageUrls: string[] = [];
  notifyManager.batch(() => {
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
    // Normalised exactly as the live query does it, and its images queued for
    // download below — the Content screen used to show blank tiles offline,
    // because only the call decks' images were ever put on the device.
    const teamBrands = normalizeTeamBrands(payload.teamBrands ?? []);
    queryClient.setQueryData(teamBrandsKey(teamId), teamBrands);
    imageUrls.push(...teamBrandImageUrls(teamBrands));

    // 2) Seed each doctor's forcing query + collect the image URLs (as the slides
    //    will request them, so the cached file keys match). Forcing is keyed by
    //    doctorId (matched server-side against the doctor's specialties).
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
  });

  // Same again before the long download, and before the final save.
  await yieldToUi();

  // 3) Download the slide images for offline playback.
  await syncImages([...new Set(imageUrls)], onProgress);

  await yieldToUi();

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
