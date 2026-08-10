import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tag } from '@/components/tag';
import { initialsOf } from '@/lib/initials';
import { CallType, type CallKind } from './callTypes';

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  specialtyId?: number;
  /** Hospital — no source column in `doctors` yet, so a dash for fetched rows. */
  hospital: string;
  /** Clinic address (doctors.doc_clinic_address). */
  address?: string;
  /** City (doctors.city). */
  city?: string;
  /** Date of the rep's last recorded call, or a dash. */
  lastVisit: string;
  /** The doctor's class for this rep — A1 / A2 / A3 / A4 ... */
  doctorClass?: string;
  /** Completed calls on this doctor this month. */
  visitCount?: number;
  /** Calls the class requires this month. Null for an unclassified doctor. */
  maxVisits?: number | null;
  /** Server view of the month's quota. */
  visitStatus?: 'in_progress' | 'completed';
  /** This month's completed calls, by how they were conducted. */
  visitsChamber?: number;
  visitsGroup?: number;
  visitsParking?: number;
  /** doctors.pmdc registration number. */
  pmdc?: string;
  scheduledTime?: string;
  status?: 'pending' | 'completed';
  isNewDoctor?: boolean;
  isNewDoctorPending?: boolean;
  teamId?: number;
}

interface DoctorCardProps {
  doctor: Doctor;
  callType?: CallType;
  /** Chamber or parking — recorded against the call this card leads to. */
  callKind?: CallKind;
  onPress?: (doctor: Doctor) => boolean | void;
}

export function DoctorCard({
  doctor,
  callType = 'planned',
  callKind,
  onPress,
}: DoctorCardProps) {
  const isCompleted = doctor.status === 'completed';

  const maxVisits = doctor.maxVisits ?? 0;
  const hasQuota = maxVisits > 0 && Boolean(doctor.doctorClass);
  const remaining = Math.max(maxVisits - (doctor.visitCount ?? 0), 0);
  const isCovered = maxVisits > 0 && remaining === 0;

  // The headline status: what's still owed this month, or that it's all done.
  // An unclassified doctor has no quota, so no pill.
  const quotaLabel =
    maxVisits === 0
      ? null
      : isCovered
        ? 'Completed'
        : `${remaining} visit${remaining === 1 ? '' : 's'} remaining`;

  const handlePress = () => {
    const handled = onPress?.(doctor);
    if (handled) return;

    if (isCompleted) {
      // Opened from the list, so no single call is in context — always the
      // month's combined report. Deliberately carries NO per-call figures: this
      // session's in-memory report would otherwise leak in and render one call's
      // numbers under a doctor whose whole month was asked for.
      router.push({
        pathname: '/call-analytics/[id]',
        params: {
          id: doctor.id,
          callType,
          mode: 'combined',
          // Scope the report to the tab it was opened from: from Group, it
          // reports on group calls, not every call this doctor had.
          callKind,
          doctorName: doctor.name,
        },
      });
      return;
    }

    router.push({
      pathname: '/doctor/[id]',
      params: {
        id: doctor.id,
        callType,
        callKind,
        completed: isCompleted ? '1' : '0',
        name: doctor.name,
        specialty: doctor.specialty,
        specialtyId: doctor.specialtyId ? String(doctor.specialtyId) : undefined,
        hospital: doctor.hospital,
        address: doctor.address,
        city: doctor.city,
        lastVisit: doctor.lastVisit,
        doctorClass: doctor.doctorClass,
        pmdc: doctor.pmdc,
        scheduledTime: doctor.scheduledTime,
        teamId: doctor.teamId ? String(doctor.teamId) : undefined,
        // Monthly coverage, so the detail screen can break it down by call kind.
        visitCount: String(doctor.visitCount ?? 0),
        maxVisits: doctor.maxVisits != null ? String(doctor.maxVisits) : undefined,
        visitsChamber: String(doctor.visitsChamber ?? 0),
        visitsGroup: String(doctor.visitsGroup ?? 0),
        visitsParking: String(doctor.visitsParking ?? 0),
      },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {/* Accent rail — green once the month's calls are all made. */}
      <View style={[styles.rail, isCompleted && styles.railCompleted]} />

      {/* No photos in this data, so the doctor's initials stand in. */}
      <View style={[styles.avatar, isCompleted && styles.avatarCompleted]}>
        <Text style={styles.avatarText}>{initialsOf(doctor.name)}</Text>
      </View>

      <View style={styles.info}>
        {/* Name, with how much of the month's quota is left beside it. */}
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {doctor.name}
          </Text>

          {quotaLabel ? (
            <Tag
              label={quotaLabel}
              icon={isCovered ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              tone={isCovered ? 'success' : 'warning'}
            />
          ) : null}
        </View>

        <View style={styles.tagRow}>
          <Tag label={doctor.specialty} icon="medkit-outline" tone="primary" />

          {doctor.isNewDoctor || doctor.isNewDoctorPending ? (
            <Tag label="New Doctor" icon="sparkles-outline" tone="warning" />
          ) : null}
          {doctor.scheduledTime ? (
            <Tag label={doctor.scheduledTime} icon="alarm-outline" tone="neutral" />
          ) : null}
        </View>

        <View style={styles.footer}>
          {hasQuota ? (
            <Tag label={doctor.doctorClass as string} icon="ribbon-outline" tone="neutral" />
          ) : null}

          {/* Same "label : value" pairing as the Doctor List card. */}
          <View style={styles.metaItem}>
            <Ionicons
              name="time-outline"
              size={14}
              color={Colors.textMuted}
              style={styles.metaIcon}
            />
            <Text style={styles.metaLabel}>Last visited :</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {doctor.lastVisit}
            </Text>
          </View>

          <View style={styles.spacer} />

          <Text style={styles.viewDetails}>View Details</Text>
        </View>
      </View>

    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingRight: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  pressed: {
    opacity: 0.85,
  },
  // Full-height colour bar down the leading edge, as in the reference.
  rail: {
    alignSelf: 'stretch',
    width: 5,
    marginVertical: -14,
    backgroundColor: Colors.primary,
  },
  railCompleted: {
    backgroundColor: Colors.success,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCompleted: {
    backgroundColor: Colors.success,
  },
  avatarText: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: Colors.text,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 10,
    marginTop: 2,
  },
  // Pushes "View Details" to the trailing edge without a fixed width.
  spacer: {
    flex: 1,
    minWidth: 8,
  },
  metaItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // Names the value beside it, matching the Doctor List card. The explicit
  // lineHeight fixes the text's box height so the 13px icon centres against it
  // identically on every platform — left to the font it drifts a pixel.
  /**
   * Icon fonts sit their glyph high in the line box — the box centres, but the
   * shape inside it doesn't, so the icon reads as floating above the text.
   * Nudging it down a pixel lines the glyph up with the letters.
   */
  metaIcon: {
    marginTop: 1.5,
  },
  metaLabel: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 17,
    color: Colors.textMuted,
  },
  viewDetails: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
});
