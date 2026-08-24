import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useCallNotes, type CallNote } from '@/api/calls';
import { Tag } from '@/components/tag';
import { Colors } from '@/constants/theme';

interface PreviousCallNotesCardProps {
  mieId?: string;
  doctorId?: string;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The quick-feedback chips are stored comma separated. */
function chipsOf(note: CallNote): string[] {
  return (note.feedback ?? '')
    .split(',')
    .map((chip) => chip.trim())
    .filter(Boolean);
}

/**
 * One call's notes: the date it was made, the chips picked and anything typed.
 *
 * A call submitted with neither says so. It is still listed — the rep was
 * there, and a silent gap in the history would read as a call never made.
 */
function NoteEntry({ note, index }: { note: CallNote; index: number }) {
  const comment = note.feedbackComment?.trim();
  const chips = chipsOf(note);
  const blank = !comment && chips.length === 0;

  return (
    <View style={styles.note}>
      <View style={styles.noteHeader}>
        {/* Counted back from the most recent, so the rep can see at a glance
            how far back a note goes without reading every date. */}
        <View style={styles.noteBadge}>
          <Text style={styles.noteBadgeText}>{index + 1}</Text>
        </View>
        <Text style={styles.date}>{formatDate(note.date)}</Text>
      </View>

      {chips.length > 0 ? (
        <View style={styles.chipRow}>
          {chips.map((chip) => (
            <Tag key={chip} label={chip} tone="neutral" style={styles.chip} />
          ))}
        </View>
      ) : null}

      {comment ? (
        // Set as a quote block — the rep's own words, not app copy.
        <View style={styles.quote}>
          <Ionicons
            name="chatbox-ellipses"
            size={14}
            color={Colors.primary}
            style={styles.quoteIcon}
          />
          <Text style={styles.comment}>{comment}</Text>
        </View>
      ) : null}

      {blank ? (
        <View style={styles.blank}>
          <Ionicons
            name="remove-circle-outline"
            size={14}
            color={Colors.textMuted}
          />
          <Text style={styles.blankText}>
            Call made — no feedback or comment was entered.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Every completed call this rep has made on this doctor, newest first, read
 * before walking into the next one. A doctor called on three times shows all
 * three — the history is the point, not just the last visit — and the calls
 * that carried no feedback are listed too, labelled as such.
 *
 * Renders NOTHING for a doctor never called on: no empty card, no placeholder.
 */
export function PreviousCallNotesCard({
  mieId,
  doctorId,
}: PreviousCallNotesCardProps) {
  const { data } = useCallNotes(mieId, doctorId);
  const notes = data ?? [];

  if (notes.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
        <Text style={styles.title}>Previous Call Notes</Text>
        <View style={styles.spacer} />
        <Text style={styles.count}>
          {notes.length} {notes.length === 1 ? 'call' : 'calls'}
        </Text>
      </View>

      {notes.map((note, index) => (
        <View key={note.id}>
          {/* Between entries only — a rule above the first would just repeat
              the card's own edge. */}
          {index > 0 ? <View style={styles.divider} /> : null}
          <NoteEntry note={note} index={index} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 10,
    boxShadow: '0px 1px 4px rgba(43, 115, 184, 0.08)',
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  spacer: {
    flex: 1,
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  note: {
    gap: 8,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: Colors.primaryLight,
  },
  noteBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.secondary,
  },
  date: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  // Deliberately plainer than the quote block: this is the app saying nothing
  // was written, not the rep's own words.
  blank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  blankText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.textMuted,
  },
  // Runs the full width of the card — the 16px padding is cancelled so the rule
  // splits the card rather than floating inside it.
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: -16,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  // A tinted block with an accent rail, so the note reads as something the rep
  // wrote rather than another line of app text.
  quote: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.background,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  quoteIcon: {
    marginTop: 3,
  },
  comment: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    color: Colors.text,
  },
});
