import Axios from 'axios';
import { API_BASE_URL } from '@/config/api-base-url';
import { getAccessToken, isOfflineSessionToken } from '@/lib/auth/tokenStore';

/**
 * Notified when the backend rejects our token (401). AuthProvider subscribes and
 * ends the session, sending the rep back to the login screen.
 *
 * A callback rather than a direct import because AuthProvider imports this
 * module — wiring it the other way would be a cycle.
 */
type UnauthorizedHandler = (code?: string) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

if (!API_BASE_URL) {
  console.warn(
    'No API base URL is configured. Set EXPO_PUBLIC_API_BASE_URL for deployed builds, EXPO_PUBLIC_LOCAL_API_BASE_URL for local web, or EXPO_PUBLIC_NATIVE_API_BASE_URL for Metro on a device if needed.'
  );
}

const axios = Axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30000,
});

axios.interceptors.request.use(
  (config) => {
    // Every /api route except login and the two x-app-key bootstrap endpoints
    // requires this. An offline session's placeholder token is deliberately NOT
    // sent — it would only ever come back 401; letting the request go without a
    // token produces the same result and keeps the placeholder off the wire.
    const token = getAccessToken();
    if (token && !isOfflineSessionToken(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.baseURL ?? ''}${config.url ?? ''}`);
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  },
);

axios.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.config.url}`, response.status);
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (status === 401) {
      // NOT every 401 means the session is bad, and treating them alike logged
      // the rep straight back out after a successful login: the two bootstrap
      // endpoints (/auth/offline-users, /doctor/planned-all) are gated by the
      // shared OFFLINE_SYNC_KEY, and they answer 401 when that key is missing or
      // mismatched — which says nothing about the user's token.
      //
      // Only the auth middleware's own codes end a session. Those three are the
      // only 401s that actually mean "your token will not work".
      const code = error.response?.data?.code;
      const isSessionFailure =
        code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID' || code === 'TOKEN_MISSING';
      // Login itself is excluded too: a wrong password is also a 401, and it
      // must surface as "invalid credentials" on the login screen rather than
      // tearing down a session that was never established.
      const isLoginRequest = String(error.config?.url ?? '').includes('/auth/login');

      if (isSessionFailure && !isLoginRequest) {
        console.warn(`[API] 401 ${code} on ${error.config?.url} — session ended`);
        onUnauthorized?.(code);
      } else {
        // e.g. a bad app key on a bootstrap call. Worth knowing about — offline
        // login and the pre-cached planned list will be unavailable — but the
        // rep stays signed in and everything else keeps working.
        console.warn(
          `[API] 401 on ${error.config?.url} (${message}) — session kept, this is not a token failure`,
        );
      }
    } else if (status) {
      // A real HTTP error from the server.
      console.error(`[API Error] ${status}:`, error.response?.data || message);
    } else {
      // No response = offline / server unreachable. Expected in offline mode;
      // log quietly so it doesn't surface as a red error overlay. Cached data
      // is served by React Query regardless.
      console.log(`[API] offline/unreachable: ${message}`);
    }
    return Promise.reject(error);
  },
);

export default axios;
