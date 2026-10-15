import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * A password change made OFFLINE, waiting to reach the server.
 *
 * The server checks the current password before it accepts a new one, so
 * until the phone is online both have to be kept. They are kept in the phone's
 * encrypted keychain (expo-secure-store: Android Keystore / iOS Keychain), never
 * in plain app storage, and deleted the moment the server answers — accepted or
 * refused. One change at a time: a second offline change replaces the first
 * (keeping the ORIGINAL current password, which is still what the server has).
 *
 * Web is only used for local testing; it has no keychain, so the change lives
 * in sessionStorage for the tab.
 */
export interface PendingPasswordChange {
  /** Who it belongs to — the same identity the server's endpoint takes. */
  userId: string;
  username: string;
  /** Every name this rep signs in with (user name, email), lower-cased. */
  identifiers: string[];
  /** What the SERVER still has. */
  currentPassword: string;
  newPassword: string;
  /** bcrypt of newPassword, so the login list can be patched without re-hashing. */
  newPasswordHash: string;
  queuedAt: string;
}

const KEY = 'e_detail_pending_password_change';

export async function readPendingPasswordChange(): Promise<PendingPasswordChange | null> {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(KEY)
          : null
        : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as PendingPasswordChange) : null;
  } catch (error) {
    console.warn('[password] could not read the pending change', error);
    return null;
  }
}

export async function savePendingPasswordChange(change: PendingPasswordChange): Promise<void> {
  const raw = JSON.stringify(change);
  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(KEY, raw);
}

export async function clearPendingPasswordChange(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY);
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  } catch (error) {
    console.warn('[password] could not clear the pending change', error);
  }
}

/** The pending change for whoever signs in as `identifier`, if any. */
export async function pendingChangeFor(identifier: string): Promise<PendingPasswordChange | null> {
  const pending = await readPendingPasswordChange();
  const needle = identifier.trim().toLowerCase();
  return pending && pending.identifiers.includes(needle) ? pending : null;
}
