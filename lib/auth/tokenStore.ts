/**
 * The access token for the current session, held where the axios interceptor can
 * reach it.
 *
 * It lives in a module rather than in React state because the interceptor runs
 * outside the component tree — and so do the background jobs that matter most
 * here: the outbox flush that uploads queued calls on reconnect, and the daily
 * sync. Those must carry the token without a component being mounted.
 *
 * AuthProvider owns the value: it sets it on login and on hydrate, and clears it
 * on logout or expiry.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Decode a JWT payload WITHOUT verifying it — only the backend can verify, and
 * does on every request. Used to spot an already-expired token so the app can
 * ask for a fresh login instead of firing requests destined to 401.
 */
function decodeJwt(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    // atob exists in Hermes and on web; global.atob is polyfilled by Expo.
    return JSON.parse(atob(padded)) as { exp?: number };
  } catch {
    return null;
  }
}

/**
 * True when a token is missing, unreadable, or past its expiry.
 *
 * NOTE the offline case: a rep who signed in against the on-device mirror has no
 * server-issued token at all (see OFFLINE_TOKEN_PREFIX), so this returns true
 * for them. That is correct — they genuinely cannot call the API — but it must
 * never be used to decide whether they may keep USING the app offline.
 */
export function isTokenExpired(token: string | null, skewSeconds = 30): boolean {
  if (!token) return true;
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() >= (payload.exp - skewSeconds) * 1000;
}

/** Marks a session created offline, which carries no server-issued token. */
export const OFFLINE_TOKEN_PREFIX = 'offline-';

/** True when this session was established offline, against the cached mirror. */
export function isOfflineSessionToken(token: string | null): boolean {
  return Boolean(token?.startsWith(OFFLINE_TOKEN_PREFIX));
}
