import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import type { PatientListRow } from '@/api/patients';

/** The three monthly strengths, as one line. */
function strengthLine(patient: PatientListRow) {
  const months = [
    patient.strength_month_1,
    patient.strength_month_2,
    patient.strength_month_3,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return months.length > 0 ? months.join(' → ') : null;
}

/** DD Mon YYYY, or a dash when the row carries no timestamp. */
function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** One labelled value in the detail grid. Renders nothing when empty. */
function Detail({ label, value }: { label: string; value?: string | null }) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{text}</Text>
    </View>
  );
}

/** One recorded patient. Every field below the name is optional, so each is
 *  dropped rather than shown blank — a sparse row stays a short card. */
export function PatientCard({ patient }: { patient: PatientListRow }) {
  const strengths = strengthLine(patient);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {patient.patient_name}
          </Text>
          {patient.city ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.meta} numberOfLines={1}>
                {patient.city}
              </Text>
            </View>
          ) : null}
        </View>

        {patient.oral_pfs ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{patient.oral_pfs}</Text>
          </View>
        ) : null}
      </View>

      {patient.contact_number ? (
        <View style={styles.metaRow}>
          <Ionicons name="call-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.meta}>{patient.contact_number}</Text>
        </View>
      ) : null}

      {patient.doctor ? (
        <View style={styles.doctorRow}>
          <Ionicons name="medkit-outline" size={14} color={Colors.primary} />
          <Text style={styles.doctorName} numberOfLines={1}>
            {patient.doctor}
            {patient.speciality ? (
              <Text style={styles.speciality}>{`  ·  ${patient.speciality}`}</Text>
            ) : null}
          </Text>
        </View>
      ) : null}

      <View style={styles.detailGrid}>
        <Detail label="Indication" value={patient.indication} />
        <Detail label="Dose" value={patient.dose} />
        <Detail label="Strength (M1 / M2 / M3)" value={strengths} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.recorded}>Recorded {formatDate(patient.created_at)}</Text>
        {/* Recorded here but not yet uploaded. Shown as information, not a
            warning — the row is safely on the device and syncs on its own. */}
        {patient.isPending ? (
          <View style={styles.pendingPill}>
            <Ionicons name="cloud-upload-outline" size={12} color={Colors.secondary} />
            <Text style={styles.pendingText}>Pending sync</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  badge: {
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.secondary,
  },
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  doctorName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  speciality: {
    fontWeight: '600',
    color: Colors.textMuted,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detail: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recorded: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.secondary,
  },
});
