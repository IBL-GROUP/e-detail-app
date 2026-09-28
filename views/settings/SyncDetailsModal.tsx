import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { APP_VERSION_WITH_BUILD } from '@/lib/appVersion';
import type { BacklogCall, CallSyncState, SyncBacklog } from '@/lib/offline/useSyncBacklog';
import { useOutbox } from '@/providers/OutboxProvider';
import { useSync } from '@/providers/SyncProvider';
import { CALL_KIND_LABELS, tallyKeyForStoredKind } from '@/views/planned-calls/callTypes';

interface SyncDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  backlog: SyncBacklog;
}

const timeFormat: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const time = date.toLocaleTimeString(undefined, timeFormat);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return `Today at ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} at ${time}`;
}

/** "12 min", "45s" — whole minutes once past one, as the call list reads best. */
function formatCallLength(seconds?: number) {
  const safe = Math.max(0, Math.floor(seconds ?? 0));
  return safe >= 60 ? `${Math.round(safe / 60)} min` : `${safe}s`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

const STATE_BADGE: Record<
  CallSyncState,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  synced: { label: 'Synced', icon: 'checkmark-circle', color: Colors.success, bg: Colors.successBg },
  pending: { label: 'Pending', icon: 'sync', color: Colors.warning, bg: Colors.warningBg },
  rejected: { label: 'Rejected', icon: 'alert-circle', color: Colors.danger, bg: Colors.dangerBg },
};

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function StateBadge({ state }: { state: CallSyncState }) {
  const badge = STATE_BADGE[state];
  return (
    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
      <Ionicons name={badge.icon} size={13} color={badge.color} />
      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

function CallRow({ entry }: { entry: BacklogCall }) {
  const { call } = entry;
  const kind = tallyKeyForStoredKind(call.institution_call_type);
  const kindLabel = kind ? CALL_KIND_LABELS[kind] : 'Call';

  const outcome =
    call.call_outcome === 'completed'
      ? `${kindLabel} (${formatCallLength(call.total_call_time_seconds)})`
      : call.call_outcome === 'cancelled'
        ? `${kindLabel} • Cancelled`
        : `${kindLabel} • Not ended`;

  // A stuck call can be days old, so the date is shown unless it is today's.
  const time = entry.at.toLocaleTimeString(undefined, timeFormat);
  const when =
    entry.at.toDateString() === new Date().toDateString()
      ? time
      : `${entry.at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;

  const icon: keyof typeof Ionicons.glyphMap =
    call.call_outcome === 'completed'
      ? 'call'
      : call.call_outcome === 'cancelled'
        ? 'close'
        : 'time-outline';
  const iconColor =
    call.call_outcome === 'cancelled'
      ? Colors.danger
      : call.call_outcome === 'completed'
        ? Colors.primary
        : Colors.textMuted;

  const name =
    call.doctor_name?.trim() || (kind === 'group' ? 'Group call' : 'Doctor not chosen');

  return (
    <View style={styles.callRow}>
      <View style={[styles.callIcon, { backgroundColor: `${iconColor}1A` }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={styles.callText}>
        <Text style={styles.callName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.callMeta} numberOfLines={1}>
          {when} • {outcome}
        </Text>
      </View>
      <StateBadge state={entry.state} />
    </View>
  );
}

/**
 * The detail behind Settings' "Sync now": when data last came down, and what
 * this device still owes the server.
 *
 * Only unsynced work is listed. A call made with a connection uploads as it
 * ends and never shows up here, so anything in this list is offline work that
 * has not reached the server yet — which is the only thing worth acting on.
 */
export function SyncDetailsModal({ visible, onClose, backlog }: SyncDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const { lastSyncedAt, isOnline, status, syncNow } = useSync();
  const { flushNow } = useOutbox();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBusy = isSubmitting || status === 'syncing';
  const canSync = isOnline && !isBusy;
  const { pendingCalls, rejectedCalls, pendingPatients, unsyncedCalls, unsyncedTotal } =
    backlog;

  // Upload first, then download — the fresh pull then already reflects the
  // calls that just landed.
  const handleSync = async () => {
    if (!canSync) return;
    setIsSubmitting(true);
    try {
      await flushNow();
      await syncNow();
    } catch (error) {
      console.warn('[sync] manual sync failed', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingParts = [
    pendingCalls > 0 ? plural(pendingCalls, 'call') : null,
    rejectedCalls > 0 ? `${plural(rejectedCalls, 'call')} rejected` : null,
    pendingPatients.length > 0 ? plural(pendingPatients.length, 'patient') : null,
  ].filter(Boolean);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isWide ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.backdrop, isWide && styles.backdropWide]}>
        <View
          style={[
            styles.sheet,
            isWide
              ? styles.sheetWide
              : [
                  styles.sheetPhone,
                  { paddingTop: insets.top, paddingBottom: insets.bottom },
                ],
          ]}
        >
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              accessibilityLabel="Close sync details"
            >
              <Ionicons name="chevron-back" size={22} color={Colors.secondary} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Data Synchronization</Text>
              <Text style={styles.version}>App version {APP_VERSION_WITH_BUILD}</Text>
            </View>
            <View style={[styles.connection, !isOnline && styles.connectionOff]}>
              <View style={[styles.connectionDot, !isOnline && styles.connectionDotOff]} />
              <Text style={[styles.connectionText, !isOnline && styles.connectionTextOff]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <ScrollView
            style={[styles.scroll, !isWide && styles.scrollFill]}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <SectionLabel>LAST SYNC</SectionLabel>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                <Text style={styles.infoText}>{formatLastSync(lastSyncedAt)}</Text>
              </View>
              {status === 'error' ? (
                <Text style={styles.errorText}>
                  The last sync didn&apos;t finish. Check your connection and try again.
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <SectionLabel>PENDING CHANGES</SectionLabel>
              <View style={styles.infoRow}>
                <Ionicons
                  name={unsyncedTotal > 0 ? 'file-tray-full-outline' : 'cloud-done-outline'}
                  size={18}
                  color={unsyncedTotal > 0 ? Colors.warning : Colors.success}
                />
                <Text style={styles.infoText}>
                  {unsyncedTotal > 0
                    ? `${pendingParts.join(' and ')} queued offline`
                    : 'Nothing pending for sync'}
                </Text>
              </View>

              {pendingPatients.length > 0 ? (
                <View style={styles.patientList}>
                  {pendingPatients.map((p) => (
                    <View key={p.clientPatientId} style={styles.patientRow}>
                      <Ionicons name="person-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.patientName} numberOfLines={1}>
                        {p.patient.patient_name || 'Unnamed patient'}
                      </Text>
                      <StateBadge state="pending" />
                    </View>
                  ))}
                </View>
              ) : null}

              {rejectedCalls > 0 ? (
                <Text style={styles.errorText}>
                  {plural(rejectedCalls, 'call')} rejected by the server and won&apos;t upload.
                </Text>
              ) : null}

              <Pressable
                onPress={() => void handleSync()}
                disabled={!canSync}
                style={({ pressed }) => [
                  styles.syncButton,
                  !isOnline && !isBusy && styles.syncButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={Colors.textOnDark} />
                ) : (
                  <Ionicons
                    name="sync-outline"
                    size={18}
                    color={isOnline ? Colors.textOnDark : Colors.disabledText}
                  />
                )}
                <Text
                  style={[
                    styles.syncButtonText,
                    !isOnline && !isBusy && styles.syncButtonTextDisabled,
                  ]}
                >
                  {isBusy ? 'Syncing…' : 'Sync Data Now'}
                </Text>
              </Pressable>
              {!isOnline ? (
                <Text style={styles.hint}>
                  You&apos;re offline. Pending changes upload automatically when you reconnect.
                </Text>
              ) : null}
            </View>

            {unsyncedCalls.length > 0 ? (
              <View style={styles.card}>
                <SectionLabel>{`CALLS WAITING TO SYNC (${unsyncedCalls.length})`}</SectionLabel>
                <View style={styles.callList}>
                  {unsyncedCalls.map((entry) => (
                    <CallRow key={entry.id} entry={entry} />
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backdropWide: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  // No `flex` here, and none of the longhands below are set twice: on web a
  // `flex: 1` base overridden by `flex: 0` leaves flexBasis at 0% while
  // dropping flexGrow, which collapses the card to zero height.
  sheet: {
    width: '100%',
    backgroundColor: Colors.background,
  },
  // Phone: the sheet IS the screen.
  sheetPhone: {
    flex: 1,
  },
  // Tablet / web: a centred card that hugs its content, up to 90% of the height.
  sheetWide: {
    maxWidth: 560,
    maxHeight: '90%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  version: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.successBg,
  },
  connectionOff: {
    backgroundColor: Colors.disabledBg,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  connectionDotOff: {
    backgroundColor: Colors.disabledText,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },
  connectionTextOff: {
    color: Colors.textMuted,
  },
  // Hugs its content so the centred tablet card is only as tall as it needs to
  // be (capped by the sheet maxHeight)...
  scroll: {
    flexShrink: 1,
  },
  // ...but fills the remaining height on a phone, where the sheet is the whole
  // screen and a long call list has to scroll rather than run off the bottom.
  // Longhands, not `flex: 1`, for the same shorthand-override reason.
  scrollFill: {
    flexGrow: 1,
    flexBasis: 0,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Colors.textMuted,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.secondary,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.danger,
  },
  hint: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  patientList: {
    gap: 8,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  patientName: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  syncButtonDisabled: {
    backgroundColor: Colors.disabledBg,
  },
  syncButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textOnDark,
  },
  syncButtonTextDisabled: {
    color: Colors.disabledText,
  },
  callList: {
    gap: 4,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  callIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  callName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  callMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
});
