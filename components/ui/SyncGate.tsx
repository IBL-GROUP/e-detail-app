import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useSync } from '@/providers/SyncProvider';
import { AppButton } from '@/components/ui/AppButton';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Gates the authenticated app on offline-sync state:
 * - First run / no cached data + syncing  -> full "Preparing today's calls" screen.
 * - No cached data + offline               -> blocking "connect to download" screen.
 * - Otherwise renders the app, with a thin banner when offline / stale / syncing.
 */
export function SyncGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isOfflineSession, canResumeOnline, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { status, progress, lastSyncedFor, isOnline, isStale, hasNoData, syncNow } =
    useSync();

  // Login flow and unauthenticated screens get no sync chrome.
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Nothing cached yet — must download before the app is usable.
  if (hasNoData) {
    if (status === 'syncing') {
      return (
        <View style={styles.fullScreen}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.title}>Preparing today&apos;s calls…</Text>
          {progress ? (
            <Text style={styles.subtitle}>
              Downloading content {progress.done}/{progress.total}
            </Text>
          ) : (
            <Text style={styles.subtitle}>Fetching your schedule</Text>
          )}
        </View>
      );
    }

    // Online but signed in offline: a download needs a server token first.
    if (isOfflineSession && isOnline) {
      return (
        <View style={styles.fullScreen}>
          {canResumeOnline ? <ActivityIndicator size="large" color={Colors.primary} /> : null}
          <Text style={styles.title}>No offline data yet</Text>
          <Text style={styles.subtitle}>
            {canResumeOnline
              ? 'Signed in offline. Connecting to the server to download today’s content…'
              : 'Signed in offline. Sign in again to download today’s content.'}
          </Text>
          {canResumeOnline ? null : (
            <View style={styles.action}>
              <AppButton label="Sign in again" onPress={() => void logout()} />
            </View>
          )}
        </View>
      );
    }

    return (
      <View style={styles.fullScreen}>
        <Text style={styles.title}>No offline data yet</Text>
        <Text style={styles.subtitle}>
          {isOnline
            ? 'Tap below to download today’s content.'
            : 'Connect to the internet to download today’s content.'}
        </Text>
        <View style={styles.action}>
          <AppButton
            label={isOnline ? 'Download now' : 'Retry'}
            onPress={() => void syncNow()}
          />
        </View>
      </View>
    );
  }

  // Has data: show the app, plus a status banner when relevant.
  // Signed in offline but the network is up: sync is held until the session
  // gets a server token, so say so rather than offering a sync that can't run.
  const bannerSignIn = isOfflineSession && isOnline;
  const showBanner = bannerSignIn || !isOnline || isStale || status === 'syncing';
  const bannerSyncing = status === 'syncing' || (bannerSignIn && canResumeOnline);
  const bannerOffline = !isOnline;

  let bannerText: string;
  let onBannerPress = () => void syncNow();
  if (bannerSignIn && canResumeOnline) {
    bannerText = 'Signed in offline · connecting to server…';
  } else if (bannerSignIn) {
    // After an app restart the typed password is gone, so the session cannot
    // upgrade itself. Signing out keeps all offline data and queued calls.
    bannerText = 'Signed in offline · tap to sign in again and sync';
    onBannerPress = () => void logout();
  } else if (bannerSyncing) {
    bannerText = progress
      ? `Syncing… ${progress.done}/${progress.total}`
      : 'Syncing today’s content…';
  } else if (bannerOffline) {
    bannerText = `Offline · showing data from ${formatDate(lastSyncedFor)}`;
  } else {
    bannerText = `Showing data from ${formatDate(lastSyncedFor)} · tap to update`;
  }

  const bannerStyle = [
    styles.banner,
    // The app draws edge-to-edge, so the banner sits under the status bar.
    // Pad it by the inset: the colour fills in behind the clock and battery
    // and the text starts below them. The screen underneath needs no change —
    // its SafeAreaView pads only by its own overlap with the status bar, which
    // is none once the banner pushes it down.
    { paddingTop: insets.top + 6 },
    bannerSyncing
      ? styles.bannerInfo
      : bannerOffline || bannerSignIn
        ? styles.bannerOffline
        : styles.bannerStale,
  ];

  return (
    <View style={styles.flex}>
      {showBanner ? (
        <View style={bannerStyle}>
          {/* Light icons on the coloured banner; unmounting restores the
              root StatusBar's own style. */}
          <StatusBar style="light" />
          {bannerSyncing ? (
            <ActivityIndicator size="small" color={Colors.textOnDark} />
          ) : null}
          <Text style={styles.bannerText} onPress={onBannerPress}>
            {bannerText}
          </Text>
        </View>
      ) : null}
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  action: {
    marginTop: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerInfo: { backgroundColor: Colors.primary },
  bannerOffline: { backgroundColor: Colors.danger },
  bannerStale: { backgroundColor: Colors.secondary },
  bannerText: {
    color: Colors.textOnDark,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
