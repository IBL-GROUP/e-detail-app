import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { Tag } from '@/components/tag';
import { Colors } from '@/constants/theme';
import { initialsOf } from '@/lib/initials';
import { DASH } from '@/views/planned-calls/mapDoctor';
import type { Doctor } from '@/views/planned-calls/DoctorCard';
import { VisitProgress } from '@/views/planned-calls/VisitProgress';

interface DoctorListCardProps {
  doctor: Doctor;
}

/** Thin rule between inline facts. */
function Divider() {
  return <View style={styles.divider} />;
}

function hasValue(value?: string) {
  return Boolean(value) && value !== DASH;
}

/** One icon + value pair in the footer strip. */
function MetaItem({
  icon,
  label,
  value,
  highlighted = false,
  textStyle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Prefix naming the value — a bare date says nothing on its own. */
  label?: string;
  value?: string;
  /** Brand-coloured — used for the PMDC number reps look up most. */
  highlighted?: boolean;
  /** Applied to BOTH halves, so a resized item never splits in two sizes. */
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.metaItem}>
      <Ionicons
        name={icon}
        size={14}
        color={highlighted ? Colors.primary : Colors.textMuted}
        style={styles.metaIcon}
      />
      {label ? <Text style={[styles.metaLabel, textStyle]}>{label}</Text> : null}
      <Text
        style={[styles.meta, highlighted && styles.metaHighlighted, textStyle]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * A doctor in the reference book: an initials avatar, then
 *   name                              · this month's visit circles
 *   specialty | class
 *   location  | PMDC | last visit
 * Calls are made from Call Reporting, so the only action here is opening the
 * record.
 */
export function DoctorListCard({ doctor }: DoctorListCardProps) {
  const maxVisits = doctor.maxVisits ?? 0;
  const done = Math.min(Math.max(doctor.visitCount ?? 0, 0), maxVisits);

  const openDetail = () => {
    router.push({
      pathname: '/doctor/[id]',
      params: {
        id: doctor.id,
        viewOnly: '1',
        name: doctor.name,
        specialty: doctor.specialty,
        specialtyId: doctor.specialtyId ? String(doctor.specialtyId) : undefined,
        hospital: doctor.hospital,
        address: doctor.address,
        city: doctor.city,
        lastVisit: doctor.lastVisit,
        doctorClass: doctor.doctorClass,
        pmdc: doctor.pmdc,
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
      onPress={openDetail}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initialsOf(doctor.name)}</Text>
      </View>

      <View style={styles.content}>
        {/* Name, with the month's visit circles opposite it. */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {doctor.name}
          </Text>
          <VisitProgress visitCount={done} maxVisits={maxVisits} showCount={false} />
        </View>

        {/* Specialty and class, each as its own tag. */}
        <View style={styles.tagRow}>
          <Tag label={doctor.specialty} icon="medkit-outline" tone="primary" />
          {hasValue(doctor.doctorClass) ? (
            <Tag
              label={doctor.doctorClass as string}
              icon="ribbon-outline"
              tone="neutral"
            />
          ) : null}
        </View>

        {/* Location | PMDC | last visit, with the arrow kept on the right. */}
        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <MetaItem
              icon="location-outline"
              value={doctor.city || doctor.address || DASH}
            />

            {hasValue(doctor.pmdc) ? (
              <>
                <Divider />
                <MetaItem icon="card-outline" value={doctor.pmdc} highlighted />
              </>
            ) : null}

            <Divider />
            <MetaItem
              icon="time-outline"
              label="Last visited :"
              value={doctor.lastVisit}
              textStyle={styles.metaLastVisit}
            />
          </View>

          <View style={styles.action}>
            <Text style={styles.actionText}>Details</Text>
            <Ionicons name="arrow-forward" size={15} color={Colors.primary} />
          </View>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  pressed: {
    opacity: 0.9,
  },
  avatar: {
    width: 46,
    height: 46,
    // Matches the card so the inner box is never rounder than its container.
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  name: {
    flex: 1,
    fontSize: 17,
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
  divider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
  },
  metaRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  /**
   * Icon fonts sit their glyph high in the line box — the box centres, but the
   * shape inside it doesn't, so the icon reads as floating above the text.
   * Nudging it down a pixel lines the glyph up with the letters.
   */
  metaIcon: {
    marginTop: 1.5,
  },
  // The explicit lineHeight fixes the text's box height so the 13px icon
  // centres against it identically on every platform — left to the font it
  // drifts a pixel.
  meta: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  // Names the value beside it; slightly heavier so the two read as a pair
  // rather than one run-on string.
  metaLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  // The registration number is what reps look up most — brand-coloured.
  metaHighlighted: {
    fontWeight: '700',
    color: Colors.primary,
  },
  // Only the last-visit pair is sized up; location and PMDC stay at 13.
  metaLastVisit: {
    fontSize: 14,
    lineHeight: 17,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
});
