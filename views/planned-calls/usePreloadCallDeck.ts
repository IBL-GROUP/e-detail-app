import { Image as ExpoImage } from 'expo-image';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

import { useForcingSlides, type ForcingContentParams } from '@/api/content';
import { ensureImagesCached, resolveCachedImage } from '@/lib/offline/imageCache';

/**
 * Whether a call can be made with this deck. A call with no forcing content
 * cannot start — there is nothing to detail (the demo slides that used to fill
 * in were test content):
 *
 *   ready        slides are in hand
 *   loading      still fetching, nothing cached yet
 *   empty        the server says there is no content for this doctor / specialty
 *   unavailable  not cached and could not be fetched (offline before syncing)
 *   none         nothing to look up — no doctor or specialty to key a deck on
 */
export type CallDeckStatus = 'ready' | 'loading' | 'empty' | 'unavailable' | 'none';

/** Why Start Call did nothing — shown when it is pressed without a deck. */
export function explainNoContent(status: CallDeckStatus) {
  switch (status) {
    case 'unavailable':
      Alert.alert(
        'Content not available',
        'The slides for this call are not on this phone yet. Connect to the internet and sync, then try again.',
      );
      return;
    // "loading" lands here too: from the rep's side, Start found nothing to
    // show, and a "still loading" message only invited them to keep tapping.
    default:
      Alert.alert(
        'No content found',
        'No content was found for this call, so it cannot be started. Please contact your manager.',
      );
  }
}

/** Opening slides decoded ahead of time, so the first swipe is instant. */
const WARM_FIRST_SLIDES = 3;
const VIDEO = /\.(mp4|webm|mov|ogv)(\?|#|$)/i;

/**
 * Gets a call's slides ready while the rep is still on the doctor's screen —
 * standing in the clinic, before Start Call — so the deck does not have to
 * load over a weak connection (a basement, a hospital corridor) once the call
 * has started and the doctor is watching.
 *
 *  1. Loads the deck under the SAME query key the call screen uses, so the
 *     call screen opens on data that is already there. This matters most for
 *     group calls: their decks depend on the specialty picked and are not part
 *     of the daily sync.
 *  2. Downloads to the device any slide image that is not on it yet — a deck
 *     that changed since the last sync, or an image whose download failed
 *     then. The call screen then plays it from the device copy.
 *  3. Decodes the first few slides into memory.
 *
 * All best-effort and silent: offline it simply uses what sync already put on
 * the device, which is the whole deck on a good day.
 */
export function usePreloadCallDeck(params: ForcingContentParams): { status: CallDeckStatus } {
  const deck = useForcingSlides(params);
  const slides = deck.data;
  // Re-run only when the deck itself changes, not on every render.
  const deckKey = slides?.map((slide) => slide.remoteUri ?? '').join('|') ?? '';

  useEffect(() => {
    if (!slides?.length) return;
    let cancelled = false;
    const remote = slides
      .map((slide) => slide.remoteUri)
      .filter((uri): uri is string => Boolean(uri));

    void (async () => {
      try {
        if (Platform.OS === 'web') {
          // No device file store on web; the browser cache does the job.
          const stills = remote.filter((uri) => !VIDEO.test(uri));
          if (stills.length) await ExpoImage.prefetch(stills, 'memory-disk');
          return;
        }

        await ensureImagesCached(remote);
        if (cancelled) return;

        const opening = remote
          .slice(0, WARM_FIRST_SLIDES)
          .filter((uri) => !VIDEO.test(uri))
          .map((uri) => resolveCachedImage(uri) ?? uri);
        if (opening.length) await ExpoImage.prefetch(opening, 'memory');
      } catch (error) {
        console.log('[preload] deck preload incomplete', (error as Error)?.message ?? error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deckKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasKey = Boolean(params.teamId && (params.doctorId || params.specialtyId));
  const status: CallDeckStatus = !hasKey
    ? 'none'
    : slides && slides.length > 0
      ? 'ready'
      : slides
        ? 'empty'
        : // Offline with nothing cached, React Query PAUSES the fetch rather
          // than failing it — that is "not on this phone", not "loading".
          deck.isError || deck.fetchStatus === 'paused'
          ? 'unavailable'
          : 'loading';
  return { status };
}
