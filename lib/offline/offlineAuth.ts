import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

import type { AuthUser } from '@/providers/AuthProvider';
import { OFFLINE_TOKEN_PREFIX } from '@/lib/auth/tokenStore';

/**
 * Offline login support. After a successful ONLINE login we store the user plus
 * a salted SHA-256 hash of their password on-device. When the server is
 * unreachable, a login attempt is verified against this cached hash so a rep who
 * has signed in before can keep working offline. The plaintext password is never
 * stored — only salt + hash.
 */

interface OfflineCredential {
  username: string; // lowercased
  salt: string;
  hash: string;
  user: AuthUser;
}

const STORAGE_KEY = 'e_detail_app_offline_cred';
const fileUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}e-detail-app-offline-cred.json`
  : null;

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
}

async function readCredential(): Promise<OfflineCredential | null> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as OfflineCredential) : null;
    }
    if (!fileUri) return null;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return raw ? (JSON.parse(raw) as OfflineCredential) : null;
  } catch {
    return null;
  }
}

async function writeCredential(cred: OfflineCredential | null): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      if (cred) localStorage.setItem(STORAGE_KEY, JSON.stringify(cred));
      else localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (!fileUri) return;
    if (cred) {
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(cred));
      return;
    }
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // best-effort; offline login just won't be available
  }
}

/**
 * Persist a verifiable credential after a successful online login.
 *
 * The access token is deliberately NOT stored: it expires within a day and is
 * useless to an offline session, which cannot reach the API anyway. Keeping a
 * live bearer token sitting on the device would be a liability for no gain.
 */
export async function saveOfflineCredential(
  username: string,
  password: string,
  user: AuthUser,
): Promise<void> {
  const salt = Crypto.randomUUID();
  const hash = await hashPassword(password, salt);
  await writeCredential({
    username: username.trim().toLowerCase(),
    salt,
    hash,
    user,
  });
}

/**
 * Verify a username/password against the cached credential (used only when the
 * server is unreachable). Returns the stored session on success, else null.
 */
export async function verifyOfflineCredential(
  username: string,
  password: string,
): Promise<{ token: string; user: AuthUser } | null> {
  const cred = await readCredential();
  if (!cred) return null;
  if (cred.username !== username.trim().toLowerCase()) return null;
  const hash = await hashPassword(password, cred.salt);
  if (hash !== cred.hash) return null;
  // A local-only marker, not a server token — see tokenStore.OFFLINE_TOKEN_PREFIX.
  // It unlocks the cached data on this device; it is never sent to the API.
  return {
    token: `${OFFLINE_TOKEN_PREFIX}${cred.user.userId}-${Date.now()}`,
    user: cred.user,
  };
}

/** Remove the cached credential (e.g. on logout). */
export async function clearOfflineCredential(): Promise<void> {
  await writeCredential(null);
}
