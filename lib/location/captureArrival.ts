import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

export interface ArrivalCapture {
  latitude?: number;
  longitude?: number;
  /** Metres, as the device reported it. Smaller is better. */
  accuracy?: number;
  /**
   * Where the position came from: a fix taken for this arrival ("gps"), or the
   * phone's last known position from the past few minutes ("last_known").
   * Absent on the provisional capture made before the fix lands.
   */
  source?: 'gps' | 'last_known';
  /** Human-readable place, filled best-effort (needs network); may be undefined. */
  arrivedLocation?: string;
  /** ISO timestamp of when arrival was marked. */
  arrivedTime: string;
}

/** Why no position could be captured. Each one stops the call — see captureArrival. */
export type LocationFailure = 'permission_denied' | 'services_off' | 'no_fix';

export class ArrivalLocationError extends Error {
  constructor(public readonly reason: LocationFailure) {
    super(reason);
    this.name = 'ArrivalLocationError';
  }
}

/**
 * How long to keep listening for a fresh fix. A first GPS fix with no network
 * to help it (offline) commonly takes 20-60s; a warm one, a few seconds.
 */
const FIX_TIMEOUT_MS = 30_000;
/**
 * How accurate a fix must be to end the wait, relaxing as the wait goes on.
 *
 * Holding out for 100m every time made a rep stand at "Getting location…" for
 * 10s and more offline, where an unassisted GPS refines slowly — while a fix to
 * within a few hundred metres, enough to place them at the clinic, had usually
 * been there for seconds. So: 100m at once, 200m after 4s — and never worse
 * than 200m (MAX_ACCURACY_M), which is as loose as a clinic visit can be placed.
 */
const ACCURACY_STEPS: { afterMs: number; metres: number }[] = [
  { afterMs: 0, metres: 100 },
  { afterMs: 4_000, metres: 200 },
];
const GOOD_ACCURACY_M = ACCURACY_STEPS[0].metres;
/**
 * The loosest position ever accepted, from any source — a fresh fix, the timeout,
 * or the last known position. Anything vaguer cannot place the rep at a clinic.
 */
const MAX_ACCURACY_M = 200;
/**
 * A position the phone already has this fresh and this accurate is used at
 * once — the rep has not moved in that time.
 */
const INSTANT_MAX_AGE_MS = 2 * 60_000;
const INSTANT_ACCURACY_M = MAX_ACCURACY_M;
/** How old a position may be and still count as "here". */
const LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;
/**
 * Reverse geocoding needs the network. Offline it is skipped outright (it used
 * to wait out its timeout, adding seconds to every offline arrival); online it
 * gets this long. The address is only a fallback — the server prefers the
 * clinic's own.
 */
const GEOCODE_TIMEOUT_MS = 2_000;

type Fix = Location.LocationObject;

/**
 * The most recent fix from ANY listener in this app — the warm-up below or a
 * capture in progress. Reused by the next capture if it is still fresh.
 */
let latestFix: Fix | null = null;

const isFresh = (fix: Fix | null, maxAgeMs: number): fix is Fix =>
  fix != null && Date.now() - fix.timestamp <= maxAgeMs;

const accuracyOf = (fix: Fix) => fix.coords.accuracy ?? Number.POSITIVE_INFINITY;

function remember(fix: Fix) {
  if (!latestFix || fix.timestamp >= latestFix.timestamp) latestFix = fix;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/**
 * Permission granted and location switched on — asking for both if needed.
 * Returns null when ready, or why not.
 */
export async function ensureLocationAccess(): Promise<LocationFailure | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== 'granted') return 'permission_denied';

    if (Platform.OS === 'web') return null;

    if (!(await Location.hasServicesEnabledAsync())) {
      if (Platform.OS === 'android') {
        // Android shows its own "Turn on location?" dialog; it rejects if the
        // rep says no.
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          // fall through to the re-check
        }
      }
      if (!(await Location.hasServicesEnabledAsync())) return 'services_off';
    }
    return null;
  } catch {
    return 'permission_denied';
  }
}

/**
 * Starts listening for position while a doctor screen is open, so that by the
 * time the rep taps Arrived the GPS has usually got a fix already. Only runs
 * when permission is already granted — it never prompts on its own. Returns a
 * stop function.
 */
export function startLocationWarmup(): () => void {
  let subscription: Location.LocationSubscription | null = null;
  let stopped = false;

  void (async () => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' || stopped) return;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3_000, distanceInterval: 0 },
        remember,
      );
      if (stopped) sub.remove();
      else subscription = sub;
    } catch {
      // Location off / unavailable — the capture itself will say so.
    }
  })();

  return () => {
    stopped = true;
    subscription?.remove();
    subscription = null;
  };
}

/**
 * Listens to the GPS until a good fix arrives or the time runs out. GPS works
 * fully OFFLINE — it needs the sky, not the internet — so this is the primary
 * source. Resolves with the best fix seen, or null.
 */
async function listenForFix(timeoutMs: number): Promise<Fix | null> {
  if (isFresh(latestFix, 60_000) && accuracyOf(latestFix) <= GOOD_ACCURACY_M) {
    return latestFix;
  }

  const startedAt = Date.now();
  const allowedNow = () => {
    const elapsed = Date.now() - startedAt;
    let metres = ACCURACY_STEPS[0].metres;
    for (const step of ACCURACY_STEPS) if (elapsed >= step.afterMs) metres = step.metres;
    return metres;
  };

  let best: Fix | null = null;
  // In an object so TypeScript sees the assignment made inside the callback.
  const watch: { subscription: Location.LocationSubscription | null } = { subscription: null };

  const result = await new Promise<Fix | null>((resolve) => {
    let settled = false;
    const finish = (fix: Fix | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(relax);
      resolve(fix);
    };
    const timer = setTimeout(
      () => finish(best && accuracyOf(best) <= MAX_ACCURACY_M ? best : null),
      timeoutMs,
    );
    // The bar drops on a clock, not only when a new fix arrives — the best fix
    // already in hand may become good enough at 4s or 10s with nothing new.
    const relax = setInterval(() => {
      if (best && accuracyOf(best) <= allowedNow()) finish(best);
    }, 500);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 1_000, distanceInterval: 0 },
      (fix) => {
        remember(fix);
        if (!best || accuracyOf(fix) < accuracyOf(best)) best = fix;
        if (accuracyOf(fix) <= allowedNow()) finish(fix);
      },
    )
      .then((sub) => {
        watch.subscription = sub;
        if (settled) sub.remove();
      })
      .catch(() => finish(null));
  });

  watch.subscription?.remove();
  return result;
}

/**
 * The rep's position for "Arrived". A position is REQUIRED — a call cannot be
 * recorded without one — so this throws an ArrivalLocationError saying why
 * when it cannot get one, and the caller stops the call.
 *
 * In order: a position the phone already has from the last 2 minutes (instant);
 * a fresh fix, listening up to FIX_TIMEOUT_MS with the accuracy bar relaxing
 * as it goes; else the phone's last known position from the past 10 minutes.
 */
export async function captureArrival(): Promise<ArrivalCapture> {
  const arrivedTime = new Date().toISOString();

  const failure = await ensureLocationAccess();
  if (failure) throw new ArrivalLocationError(failure);

  let fix: Fix | null = null;
  let source: ArrivalCapture['source'] = 'gps';

  // Instant: a recent, decent position already on the phone (the warm-up's, or
  // the system's own cache).
  if (isFresh(latestFix, INSTANT_MAX_AGE_MS) && accuracyOf(latestFix) <= INSTANT_ACCURACY_M) {
    fix = latestFix;
  } else {
    try {
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: INSTANT_MAX_AGE_MS,
        requiredAccuracy: INSTANT_ACCURACY_M,
      });
      if (cached) {
        fix = cached;
        source = 'last_known';
      }
    } catch {
      // no cached position — listen below
    }
  }

  if (!fix) fix = await listenForFix(FIX_TIMEOUT_MS);

  if (!fix) {
    // Nothing fresh: the phone's last known position from the past 10 minutes.
    source = 'last_known';
    if (isFresh(latestFix, LAST_KNOWN_MAX_AGE_MS) && accuracyOf(latestFix) <= MAX_ACCURACY_M) {
      fix = latestFix;
    } else {
      try {
        fix = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
          requiredAccuracy: MAX_ACCURACY_M,
        });
      } catch {
        fix = null;
      }
    }
  }
  if (!fix) throw new ArrivalLocationError('no_fix');

  const { latitude, longitude, accuracy } = fix.coords;

  // Best-effort address; needs the network, so offline it simply stays empty.
  let arrivedLocation: string | undefined;
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false || net.isInternetReachable === false) {
      throw new Error('offline');
    }
    const places = await withTimeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      GEOCODE_TIMEOUT_MS,
    );
    const place = places?.[0];
    if (place) {
      arrivedLocation =
        [place.name, place.street, place.city, place.region].filter(Boolean).join(', ') ||
        undefined;
    }
  } catch {
    // offline / geocoder unavailable — keep just the coordinates
  }

  return {
    latitude,
    longitude,
    accuracy: accuracy ?? undefined,
    source,
    arrivedLocation,
    arrivedTime,
  };
}

/**
 * Tells the rep why there is no location and what to do, with the one action
 * that fixes it. `onRetry` runs the capture again.
 */
export function explainLocationFailure(reason: LocationFailure, onRetry: () => void) {
  switch (reason) {
    case 'permission_denied':
      Alert.alert(
        'Location permission needed',
        'A call can only be recorded with your location. Allow location for this app in Settings, then tap Arrived again.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    case 'services_off':
      Alert.alert(
        'Turn on location',
        'Location is switched off on this phone. Turn it on to record the call — it works without internet.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Try again', onPress: onRetry },
        ],
      );
      return;
    case 'no_fix':
    default:
      Alert.alert(
        'Location not found yet',
        'The phone could not get a GPS signal. Step near a window or outside for a moment, then try again.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Try again', onPress: onRetry },
        ],
      );
  }
}
