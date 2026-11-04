import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Tag } from '@/components/tag';
import { Colors } from '@/constants/theme';
import { initialsOf } from '@/lib/initials';
import type { AssignedDoctor } from '@/api/doctorProfiles';
import { formatDoctorName } from './profileRules';

/** Thin rule between inline facts. */
function Divider() {
  return <View style={styles.divider} />;
}

/**
 * One assigned doctor on the Doctor Info list.
 *
 * The doctor list's card parts — 46px navy avatar, 17px name, 13px meta with
 * 14px icons, the shared Tag — with the profile state on the right: Pending
 * (amber) until profiled, Captured (green) after, and "Waiting to sync" while
 * the profile is still only on this device.
 */
export function AssignedDoctorCard({
  doctor,
  onPress,
}: {
  doctor: AssignedDoctor;
  onPress: (doctor: AssignedDoctor) => void;
}) {
  const name = formatDoctorName(doctor.doctorName) || doctor.pmdcNumber;
  const city = String(doctor.city ?? '').trim();
  const specialty = String(doctor.specialty ?? '').trim();

  return (
    <Pressable
      onPress={() => onPress(doctor)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {initialsOf(String(doctor.doctorName ?? '').replace(/^dr\.?\s+/i, ''))}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="card-outline" size={14} color={Colors.primary} style={styles.metaIcon} />
            <Text style={[styles.meta, styles.metaHighlighted]} numberOfLines={1}>
              {doctor.pmdcNumber}
            </Text>
          </View>
          {city ? <Divider /> : null}
          {city ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} style={styles.metaIcon} />
              <Text style={styles.meta} numberOfLines={1}>
                {city}
              </Text>
            </View>
          ) : null}
        </View>
        {specialty ? <Tag label={specialty} icon="medkit-outline" tone="primary" /> : null}
      </View>

      <View style={styles.right}>
        {doctor.filled ? (
          <Tag
            label={doctor.isPending ? 'Waiting to sync' : 'Captured'}
            icon={doctor.isPending ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
            tone={doctor.isPending ? 'neutral' : 'success'}
          />
        ) : (
          <Tag label="Pending" icon="create-outline" tone="warning" />
        )}
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The doctor list card's surface, radius, padding and shadow.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
    opacity: 0.85,
  },
  avatar: {
    width: 46,
    height: 46,
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
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaIcon: {
    marginTop: 1.5,
  },
  meta: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  metaHighlighted: {
    fontWeight: '700',
    color: Colors.primary,
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
  },
  right: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 8,
  },
});
