import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Tag, type TagTone } from '@/components/tag';
import { Colors } from '@/constants/theme';
import { initialsOf } from '@/lib/initials';
import { ImageViewerModal } from './ImageViewerModal';
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
 * Oral and PFS are the two ways the product is given, so they take two
 * different tones — scanning the list, the route is what separates one
 * patient's regimen from another's.
 */
function routeTone(oralPfs: string): TagTone {
  return oralPfs.toUpperCase() === 'PFS' ? 'success' : 'primary';
}

/** Thin rule between inline facts. */
function Divider() {
  return <View style={styles.divider} />;
}

/** One icon + value pair in a meta strip. */
function MetaItem({
  icon,
  value,
  highlighted = false,
  lines = 1,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  /** Brand-coloured — used for the contact number reps act on. */
  highlighted?: boolean;
  /** How many lines the value may wrap to. One, except for the address. */
  lines?: number;
}) {
  return (
    // Top-aligned when the value can wrap, so the icon sits beside the FIRST
    // line rather than floating in the middle of a two-line address.
    <View style={[styles.metaItem, lines > 1 && styles.metaItemTop]}>
      <Ionicons
        name={icon}
        size={14}
        color={highlighted ? Colors.primary : Colors.textMuted}
        style={styles.metaIcon}
      />
      <Text
        style={[styles.meta, highlighted && styles.metaHighlighted]}
        numberOfLines={lines}
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
        <Ionicons name={icon} size={14} color={Colors.textMuted} />
        <Text style={styles.blockLabel}>{label}</Text>
      </View>
      <Text style={styles.tileValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A patient in the rep's log.
 *
 * Grouped into blocks — identity, prescriber, clinical detail, strength course,
 * then a footer — rather than run together as one strip, because a patient row
 * carries free text (indication, dose) that a single inline run crushes.
 *
 * The PARTS are the doctor list's: the same 46px navy avatar, 17px name, 13px
 * meta at 14px icons, and the shared Tag component with its tones. Only the
 * arrangement differs, and only where the content needs it.
 */
export function PatientCard({
  patient,
  onEdit,
}: {
  patient: PatientListRow;
  /** Opens this patient in the form for editing. */
  onEdit?: (patient: PatientListRow) => void;
}) {
  // Which attachment the full-screen viewer is showing, or null when closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const city = text(patient.city);
  const address = text(patient.address);
  const contact = text(patient.contact_number);
  const doctor = text(patient.doctor);
  const speciality = text(patient.speciality);
  const indication = text(patient.indication);
  const dose = text(patient.dose);
  const oralPfs = text(patient.oral_pfs);
  const attachments = (patient.attachments ?? []).filter(Boolean);

  /**
   * The strength course, one tag per month.
   *
   * These used to render as "1 → 2 → 3", which read as a single value with
   * arrows in it and never said which month was which. Each now carries its
   * own label.
   */
  const months = [
    { label: 'M1', value: text(patient.strength_month_1) },
    { label: 'M2', value: text(patient.strength_month_2) },
    { label: 'M3', value: text(patient.strength_month_3) },
  ].filter((month) => month.value.length > 0);

  /**
   * Street address and city as one place: "House 42, Block C, Karachi".
   *
   * Either half can be missing — a rep may record only a city, or an address
   * with no city picked — so the comma only appears when there are two halves
   * to join.
   */
  const location = [address, city].filter(Boolean).join(', ');

  const hasIdentityMeta = Boolean(location || contact);
  const hasTiles = Boolean(indication || dose);

  return (
    <View style={styles.card}>
      {/* Identity: avatar, name, where they are and how to reach them. */}
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
              {/* One place, read as an address: "House 42, Block C, Karachi".
                  Two lines rather than the strip's usual one, because the street
                  half is long enough that a single line clips it to nothing. */}
              {location ? (
                <MetaItem icon="location-outline" value={location} lines={2} />
              ) : null}
              {location && contact ? <Divider /> : null}
              {contact ? (
                <MetaItem icon="call-outline" value={contact} highlighted />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* How the product is given, with the date it was logged beneath it —
            the two facts about the record itself, kept out of the clinical
            detail below. */}
        <View style={styles.headerRight}>
          {oralPfs ? (
            <Tag
              label={oralPfs}
              icon="medical-outline"
              tone={routeTone(oralPfs)}
              style={styles.headerTag}
            />
          ) : null}
          <MetaItem icon="calendar-outline" value={formatDate(patient.created_at)} />
        </View>
      </View>

      {/* The prescriber, with their specialty as its own tag. */}
      {doctor ? (
        <View style={styles.doctorRow}>
          <View style={styles.doctorIcon}>
            <Ionicons name="person-outline" size={14} color={Colors.primary} />
          </View>
          <Text style={styles.doctorName} numberOfLines={1}>
            {doctor}
          </Text>
          {speciality ? (
            <Tag label={speciality} icon="medkit-outline" tone="primary" />
          ) : null}
        </View>
      ) : null}

      {/* Clinical detail, panelled so labels and values don't run together. */}
      {hasTiles ? (
        <View style={styles.tileRow}>
          {indication ? (
            <DetailTile
              icon="document-text-outline"
              label="Indication"
              value={indication}
            />
          ) : null}
          {dose ? (
            <DetailTile icon="flask-outline" label="Dose" value={dose} />
          ) : null}
        </View>
      ) : null}


      {months.length > 0 || attachments.length > 0 || onEdit ? (
        <View style={styles.strengthBlock}>
          {months.length > 0 ? (
            <View style={styles.tileLabelRow}>
              {/* An actual capsule. Ionicons has no pill glyph at all, so this
                  one comes from Material — the same mixed-family approach
                  CallKindSelector already takes. Material's glyphs read a touch
                  smaller at the same nominal size, so it's bumped a point to sit
                  level with the Ionicons labels beside it. */}
              <MaterialCommunityIcons name="pill" size={15} color={Colors.textMuted} />
              <Text style={styles.blockLabel}>Strength</Text>
            </View>
          ) : null}

          {/* The month tags and the card's actions share ONE line: tags from the
              left, buttons pushed to the far right. They wrap onto their own row
              only when the card is too narrow to hold both. */}
          <View style={styles.strengthRow}>
            <View style={styles.tagRow}>
              {months.map((month) => (
                <Tag
                  key={month.label}
                  label={`${month.label} · ${month.value}`}
                  tone="neutral"
                />
              ))}
            </View>

            <View style={styles.actions}>
              {attachments.length > 0 ? (
                <Pressable
                  onPress={() => setViewerIndex(0)}
                  style={({ pressed }) => [
                    styles.viewButton,
                    pressed && styles.thumbPressed,
                  ]}
                >
                  <Ionicons name="eye-outline" size={15} color={Colors.primary} />
                  <Text style={styles.viewButtonText}>
                    {attachments.length === 1
                      ? 'View Prescription'
                      : `View Prescriptions (${attachments.length})`}
                  </Text>
                </Pressable>
              ) : null}

              {onEdit ? (
                <Pressable
                  onPress={() => onEdit(patient)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.editButton,
                    pressed && styles.thumbPressed,
                  ]}
                >
                  <Ionicons name="create-outline" size={15} color={Colors.primary} />
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}


      <ImageViewerModal
        images={attachments}
        startIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Same surface, radius, padding and shadow as the doctor list's card; a
  // column rather than a row because the content stacks into blocks.
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
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  // The record's own facts, stacked in the corner. flexShrink 0 keeps the date
  // on one line; the patient name beside it truncates instead, which is the
  // right trade — a wrapped date reads as broken, a clipped long name doesn't.
  headerRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 6,
  },
  // Tag sets alignSelf 'flex-start' for use in a row; in this column that would
  // pull it away from the right edge the date sits on.
  headerTag: {
    alignSelf: 'flex-end',
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
  metaItemTop: {
    alignItems: 'flex-start',
  },
  /**
   * Icon fonts sit their glyph high in the line box — the box centres, but the
   * shape inside it doesn't, so the icon reads as floating above the text.
   * Nudging it down a pixel lines the glyph up with the letters.
   */
  metaIcon: {
    marginTop: 1.5,
  },
  // The explicit lineHeight fixes the text's box height so the 14px icon
  // centres against it identically on every platform.
  meta: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  // The contact number is what a rep acts on — brand-coloured, as the doctor
  // card treats the PMDC.
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
    width: 26,
    height: 26,
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
  // Only used by the month tags now, sharing its line with the action buttons —
  // it shrinks so the buttons keep their width rather than being pushed off.
  tagRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  tileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flex: 1,
    // Below this the label wraps mid-word; the row wraps to a new line instead.
    minWidth: 150,
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
    gap: 5,
  },
  // Same size and weight as the doctor card's meta label, so a panel heading
  // and an inline "Last visited :" read as the same kind of thing.
  blockLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
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
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Wraps rather than crushing the tags when the card is narrow.
    flexWrap: 'wrap',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    // Pushed to the far right of the row; on a wrap it stays right-aligned.
    marginLeft: 'auto',
    gap: 4,
  },
  // Borderless against the outlined prescription pill: both are actions, but
  // viewing is the one a rep reaches for, and two identical pills would make
  // them compete. Padded to the same height so the row still lines up.
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  // A tinted pill: it is an action, so it should not read as another
  // read-only label sitting among the detail panels above it.
  viewButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  thumbPressed: {
    opacity: 0.75,
  },
});
