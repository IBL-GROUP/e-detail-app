import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ApprovalStatus, DoctorProfileApproval } from '@/api/doctorProfiles';
import { Tag, type TagTone } from '@/components/tag';
import { Colors } from '@/constants/theme';

type ApprovalTagSpec = { label: string; icon: keyof typeof Ionicons.glyphMap; tone: TagTone };

/**
 * The approval tag for each status (DINFO-FR-013). PENDING reads "Pending
 * review", deliberately not "Pending": the list already uses "Pending" for a
 * doctor not yet profiled (DINFO-FR-001).
 */
const APPROVAL_TAGS: Record<ApprovalStatus, ApprovalTagSpec> = {
  APPROVED: { label: 'Approved', icon: 'checkmark-circle-outline', tone: 'success' },
  PENDING: { label: 'Pending review', icon: 'time-outline', tone: 'warning' },
  REJECTED: { label: 'Rejected', icon: 'close-circle-outline', tone: 'danger' },
};

/**
 * The tag for a status, or null when the status is missing (an older server,
 * DINFO-DATA-005) or not one the app knows — the caller then shows no
 * approval tag.
 */
export function approvalTagFor(status: unknown): ApprovalTagSpec | null {
  return typeof status === 'string' && status in APPROVAL_TAGS
    ? APPROVAL_TAGS[status as ApprovalStatus]
    : null;
}

/**
 * Under the profile header (DINFO-FR-014): who rejected it, why, and that the
 * rep does not recapture it — the console corrects it (DINFO-BR-015). An
 * approval with a comment shows the comment quietly; anything else, nothing.
 */
export function ApprovalNotice({ approval }: { approval?: DoctorProfileApproval | null }) {
  if (!approval) return null;
  const reason = String(approval.reason ?? '').trim();
  const note = String(approval.note ?? '').trim();

  if (approval.status === 'REJECTED') {
    const by = String(approval.decidedByName ?? '').trim() || 'your manager';
    return (
      <View style={styles.rejected} accessibilityRole="alert">
        <View style={styles.titleRow}>
          <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
          <Text style={styles.rejectedTitle}>Rejected by {by}</Text>
        </View>
        {reason ? <Text style={styles.reason}>{reason}</Text> : null}
        {note ? <Text style={styles.note}>“{note}”</Text> : null}
        <Text style={styles.hint}>
          Your manager&apos;s team will correct this profile in the console. You don&apos;t need to
          capture it again.
        </Text>
      </View>
    );
  }

  if (approval.status === 'APPROVED' && note) {
    return (
      <View style={styles.approvedNote}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.approvedNoteText}>{note}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  rejected: {
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rejectedTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.danger,
  },
  reason: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  note: {
    fontSize: 13,
    color: Colors.text,
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  approvedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12,
  },
  approvedNoteText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMuted,
  },
});
