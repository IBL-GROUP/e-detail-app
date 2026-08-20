import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Tag, type TagTone } from '@/components/tag';
import { Colors } from '@/constants/theme';
import { initialsOf } from '@/lib/initials';
import type { PatientListRow } from '@/api/patients';

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

function text(value?: string | null) {
  return String(value ?? '').trim();
}

/**
 * Oral and PFS are the two ways the product is given, so they get two different
 * colours — at a glance down the list, the route is the thing that separates one
 * patient's regimen from another's.
 */
function routeTone(oralPfs: string): TagTone {
  return oralPfs.toUpperCase() === 'PFS' ? 'success' : 'primary';
}

/** Thin rule between inline facts — matches the doctor list's meta strip. */
function Divider() {
  return <View style={styles.divider} />;
}

/** One icon + value pair in the identity strip. */
function MetaItem({
  icon,
  value,
  highlighted = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  /** Brand-coloured — used for the contact number, the field reps act on. */
  highlighted?: boolean;
}) {
  return (
    <View style={styles.metaItem}>
      <Ionicons
        name={icon}
        size={13}
        color={highlighted ? Colors.primary : Colors.textMuted}
        style={styles.metaIcon}
      />
      <Text
        style={[styles.meta, highlighted && styles.metaHighlighted]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** A labelled fact on its own tinted panel — Indication and Dose. */
function DetailTile({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileLabelRow}>
        <Ionicons name={icon} size={11} color={Colors.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={styles.tileValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One month of the strength course.
 *
 * The three months used to render as "1 → 2 → 3" on a single line, which read
 * as one value with arrows in it rather than three separate months — and said
 * nothing about WHICH month was which. Each now carries its own label.
 */
function MonthPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.monthPill}>
      <Text style={styles.monthLabel}>{label}</Text>
      <Text style={styles.monthValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One recorded patient.
 *
 * Laid out like the doctor list's card so the two read as the same family: an
 * initials avatar, the name with its identity strip, then the clinical detail
 * grouped into panels rather than run together as a line of labels. Every field
 * below the name is optional, so each block is dropped when empty and a sparse
 * row stays a short card.
 */
export function PatientCard({ patient }: { patient: PatientListRow }) {
  const city = text(patient.city);
  const contact = text(patient.contact_number);
  const doctor = text(patient.doctor);
  const speciality = text(patient.speciality);
  const indication = text(patient.indication);
  const dose = text(patient.dose);
  const oralPfs = text(patient.oral_pfs);

  const months = [
    { label: 'Month 1', value: text(patient.strength_month_1) },
    { label: 'Month 2', value: text(patient.strength_month_2) },
    { label: 'Month 3', value: text(patient.strength_month_3) },
  ].filter((month) => month.value.length > 0);

  const hasIdentityMeta = Boolean(city || contact);
  const hasTiles = Boolean(indication || dose);

  return (
    <View style={[styles.card, patient.isPending && styles.cardPending]}>
      {/* Identity: avatar, name, where and how to reach them. */}
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(patient.patient_name)}</Text>
        </View>

        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {patient.patient_name}
          </Text>

          {hasIdentityMeta ? (
            <View style={styles.metaRow}>
              {city ? <MetaItem icon="location-outline" value={city} /> : null}
              {city && contact ? <Divider /> : null}
              {contact ? (
                <MetaItem icon="call-outline" value={contact} highlighted />
              ) : null}
            </View>
          ) : null}
        </View>

        {oralPfs ? (
          <Tag label={oralPfs} icon="medical-outline" tone={routeTone(oralPfs)} />
        ) : null}
      </View>

      {/* The prescriber, with their specialty as its own tag. */}
      {doctor ? (
        <View style={styles.doctorRow}>
          <View style={styles.doctorIcon}>
            <Ionicons name="medkit-outline" size={13} color={Colors.primary} />
          </View>
          <Text style={styles.doctorName} numberOfLines={1}>
            {doctor}
          </Text>
          {speciality ? (
            <Tag label={speciality} tone="neutral" style={styles.specialityTag} />
          ) : null}
        </View>
      ) : null}

      {/* Clinical detail, panelled so labels and values don't run together. */}
      {hasTiles ? (
        <View style={styles.tileRow}>
          {indication ? (
            <DetailTile
              icon="document-text-outline"
              label="INDICATION"
              value={indication}
            />
          ) : null}
          {dose ? (
            <DetailTile icon="flask-outline" label="DOSE" value={dose} />
          ) : null}
        </View>
      ) : null}

      {months.length > 0 ? (
        <View style={styles.strengthBlock}>
          <Text style={styles.blockLabel}>STRENGTH</Text>
          <View style={styles.monthRow}>
            {months.map((month) => (
              <MonthPill key={month.label} label={month.label} value={month.value} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.recordedRow}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.recorded}>
            Recorded {formatDate(patient.created_at)}
          </Text>
        </View>

        {/* Recorded here but not yet uploaded. Amber, because it is a state to
            notice rather than an error — the row is safely on the device and
            syncs on its own. */}
        {patient.isPending ? (
          <Tag label="Pending sync" icon="cloud-upload-outline" tone="warning" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  // A queued row is marked on the card itself, not only by the footer tag, so
  // it is identifiable while scrolling past.
  cardPending: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    // Matches the card so the inner box is never rounder than its container.
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerText: {
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
  /**
   * Icon fonts sit their glyph high in the line box, so it reads as floating
   * above the text. A pixel down lines the glyph up with the letters.
   */
  metaIcon: {
    marginTop: 1.5,
  },
  // The explicit lineHeight fixes the text box height so the icon centres
  // against it identically on every platform.
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
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  doctorIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  specialityTag: {
    marginLeft: 2,
  },
  tileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flex: 1,
    // Below this the label wraps mid-word; the row wraps to a new line instead.
    minWidth: 140,
    gap: 4,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Colors.textMuted,
  },
  tileValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  strengthBlock: {
    gap: 6,
  },
  blockLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Colors.textMuted,
  },
  monthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthPill: {
    minWidth: 84,
    gap: 2,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  monthLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.secondary,
    opacity: 0.75,
  },
  monthValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.secondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  recordedRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recorded: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
