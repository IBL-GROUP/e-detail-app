import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * The release people actually see, e.g. "v1.0.1".
 *
 * Deliberately the human version rather than the Android versionCode: the code
 * only counts builds and means nothing to a rep reading it out over the phone.
 * Read from the running binary, so it cannot drift from what was installed.
 */
export const APP_VERSION = `v${Constants.expoConfig?.version ?? '—'}`;

/** The store build number (Android versionCode / iOS buildNumber), or null on web. */
export const APP_BUILD: string | null = (() => {
  const build =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Platform.OS === 'android'
        ? Constants.expoConfig?.android?.versionCode
        : undefined;
  return build != null ? String(build) : null;
})();

/** "v1.0.2 (Build 30)" — for support screens, where the build number matters. */
export const APP_VERSION_WITH_BUILD = APP_BUILD
  ? `${APP_VERSION} (Build ${APP_BUILD})`
  : APP_VERSION;
