import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { usePathname } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import {
  checkpointSpans,
  closeSpan,
  flushUsage,
  flushUsageToDisk,
  getScreenView,
  MAIN_TABS,
  subscribeScreenViews,
  openSpan,
  recoverOpenSpans,
  screenKeyForPath,
  type UsageUser,
} from '@/lib/usage/usageLog';

/** How often open spans are checkpointed — bounds what a killed app loses. */
const CHECKPOINT_MS = 30_000;
/** How often the queue is offered to the server while the app is open. */
const FLUSH_MS = 5 * 60_000;

/**
 * Feeds the usage log (lib/usage/usageLog.ts) from what the app is doing:
 *
 *   app      foreground time, while a rep is signed in
 *   screen   which screen is showing, from the router path
 *   network  online vs offline stretches, while the app is open
 *
 * Renders nothing. Mounted once, inside the providers, so it sees the session
 * and the router. Nothing is measured while signed out or in the background —
 * the phone sitting in a pocket is not time spent in the app.
 */
export function UsageTracker() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [online, setOnline] = useState<boolean | null>(null);

  // A stable snapshot of the rep, so effects re-run only when the rep changes.
  const usageUser = useMemo<UsageUser | null>(
    () =>
      user
        ? {
            userId: user.userId,
            username: user.username,
            name: user.name,
            mieId: user.mieId,
            teamId: user.teamId,
          }
        : null,
    [user],
  );
  const userKey = usageUser ? String(usageUser.userId) : null;
  const active = appState === 'active' && usageUser !== null;
  const routeScreen = screenKeyForPath(pathname);
  // A view inside the screen, if it reports one (Analytics: call / sales).
  const view = useSyncExternalStore(
    subscribeScreenViews,
    () => getScreenView(routeScreen),
    () => undefined,
  );
  const screen = view ? `${routeScreen}_${view}` : routeScreen;
  // The bottom tab the rep is "in": the last of the four they visited. A screen
  // opened from it (Content from Home, a doctor and its call from e-Detailing)
  // is filed under it, so a tab's time includes everything done inside it.
  const tabRef = useRef<string | undefined>(undefined);
  if (MAIN_TABS.has(routeScreen)) tabRef.current = routeScreen;
  const tab = tabRef.current;

  // First: close whatever the previous run left open (it was killed).
  useEffect(() => {
    void recoverOpenSpans();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void NetInfo.fetch().then((net) => setOnline(Boolean(net.isConnected)));
    return NetInfo.addEventListener((net) => setOnline(Boolean(net.isConnected)));
  }, []);

  // Why a span ends when it is not replaced: signed out, or app backgrounded.
  const endReason = usageUser ? 'background' : 'signed_out';

  useEffect(() => {
    if (active && usageUser) void openSpan('app', 'app', usageUser);
    else void closeSpan('app', endReason);
  }, [active, userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active && usageUser) void openSpan('screen', screen, usageUser, tab);
    else void closeSpan('screen', endReason);
  }, [active, userKey, screen, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active && usageUser && online !== null) {
      void openSpan('network', online ? 'online' : 'offline', usageUser);
    } else {
      void closeSpan('network', endReason);
    }
  }, [active, userKey, online]); // eslint-disable-line react-hooks/exhaustive-deps

  // While open: checkpoint, and offer the queue to the server now and then.
  useEffect(() => {
    if (!active) return;
    const checkpoint = setInterval(() => void checkpointSpans(), CHECKPOINT_MS);
    const flush = setInterval(() => void flushUsage(), FLUSH_MS);
    return () => {
      clearInterval(checkpoint);
      clearInterval(flush);
    };
  }, [active]);

  // Leaving the foreground may be the last chance to write (the OS can kill a
  // backgrounded app): put the just-closed spans on disk at once.
  useEffect(() => {
    if (appState !== 'active') void flushUsageToDisk();
  }, [appState]);

  // Upload when it is likely to work: on open, on reconnect, and on the way to
  // the background (after the spans above have closed, so they go too).
  useEffect(() => {
    if (online) void flushUsage();
  }, [online, appState, userKey]);

  return null;
}
