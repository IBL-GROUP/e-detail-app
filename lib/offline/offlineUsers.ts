import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import bcrypt from 'bcryptjs';

/**
 * A device-local mirror of the ACTIVE `user_validation` login records, pulled
 * after an online login (see AuthProvider). It lets ANY active user sign in
 * OFFLINE: their typed password is checked on-device against the stored bcrypt
 * hash. Nothing here needs the network.
 *
 * Stored as a JSON file (localStorage on web). The plaintext password is never
 * stored — only the server's bcrypt hash.
 */

export interface OfflineUserRecord {
  userId: number | string;
  username: string;
  email?: string;
  displayName?: string;
  passwordHash: string;
  accountLocked?: boolean;
  teamId?: number | string | null;
  teamName?: string | null;
  mieId?: number | string | null;
}

const STORAGE_KEY = 'e_detail_app_offline_users';
const fileUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}e-detail-app-offline-users.json`
  : null;

export async function saveOfflineUsers(users: OfflineUserRecord[]): Promise<void> {
  const json = JSON.stringify(users ?? []);
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, json);
      return;
    }
    if (!fileUri) return;
    await FileSystem.writeAsStringAsync(fileUri, json);
  } catch (error) {
    console.warn('[Auth] Failed to persist offline users', error);
  }
}

export async function readOfflineUsers(): Promise<OfflineUserRecord[]> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as OfflineUserRecord[]) : [];
    }
    if (!fileUri) return [];
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return raw ? (JSON.parse(raw) as OfflineUserRecord[]) : [];
  } catch (error) {
    console.warn('[Auth] Failed to read offline users', error);
    return [];
  }
}

export async function getOfflineUsersCount(): Promise<number> {
  return (await readOfflineUsers()).length;
}

/**
 * Verify a username/email + password against the local mirror (offline). Returns
 * the matching record on success, else null. Matching is case-insensitive on
 * username OR email; the password is checked against the stored bcrypt hash.
 */
export async function verifyOfflineUser(
  usernameOrEmail: string,
  password: string,
): Promise<OfflineUserRecord | null> {
  const needle = usernameOrEmail.trim().toLowerCase();
  if (!needle) return null;

  const users = await readOfflineUsers();
  const match = users.find(
    (u) =>
      u.username?.trim().toLowerCase() === needle ||
      (u.email ?? '').trim().toLowerCase() === needle,
  );
  if (!match || match.accountLocked || !match.passwordHash) return null;

  try {
    const ok = bcrypt.compareSync(String(password), String(match.passwordHash));
    return ok ? match : null;
  } catch {
    return null;
  }
}

const matchesAny = (u: OfflineUserRecord, identifiers: string[]) =>
  identifiers.includes(u.username?.trim().toLowerCase() ?? '') ||
  identifiers.includes((u.email ?? '').trim().toLowerCase());

/**
 * A copy of `users` with this rep's hash replaced — used when a fresh list
 * arrives from the server while an offline password change has not reached it
 * yet: the server's copy still has the OLD hash, and offline sign-in must keep
 * accepting the NEW password until the change lands.
 */
export function withPasswordOverride(
  users: OfflineUserRecord[],
  identifiers: string[],
  passwordHash: string,
): OfflineUserRecord[] {
  return users.map((u) => (matchesAny(u, identifiers) ? { ...u, passwordHash } : u));
}

/**
 * Switches this rep's offline sign-in to `newPassword` on the device: the old
 * password stops working offline, the new one starts. Returns the new bcrypt
 * hash, or null when the rep is not in the list (nothing to patch).
 *
 * The salt is taken from the existing hash rather than generated: bcryptjs has
 * no secure random source in React Native, and a bcrypt salt does not need to
 * change with the password for the hash to be sound.
 */
export async function patchOfflineUserPassword(
  identifiers: string[],
  newPassword: string,
): Promise<string | null> {
  const users = await readOfflineUsers();
  const match = users.find((u) => matchesAny(u, identifiers));
  if (!match?.passwordHash) return null;

  const salt = match.passwordHash.slice(0, 29);
  const passwordHash = await bcrypt.hash(String(newPassword), salt);
  await saveOfflineUsers(withPasswordOverride(users, identifiers, passwordHash));
  return passwordHash;
}
