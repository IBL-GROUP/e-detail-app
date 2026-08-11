import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useLastCallFeedback } from '@/api/calls';
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

/**
 * What the rep wrote on their last call with this doctor, read before walking
 * into the next one.
 *
 * Renders NOTHING when there are no notes — a doctor never called on, or one
 * whose calls were submitted without feedback, shows no empty card and no
 * placeholder. Nothing is worse than a box that says "no comments".
 */
export function PreviousCallNotesCard({
  mieId,
  doctorId,
}: PreviousCallNotesCardProps) {
  const { data } = useLastCallFeedback(mieId, doctorId);

  const comment = data?.feedbackComment?.trim();
  // The quick-feedback chips are stored comma separated.
  const chips = (data?.feedback ?? '')
    .split(',')
    .map((chip) => chip.trim())
    .filter(Boolean);

  if (!data || (!comment && chips.length === 0)) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
        <Text style={styles.title}>Previous Call Notes</Text>
        <View style={styles.spacer} />
        <Text style={styles.date}>{formatDate(data.date)}</Text>
      </View>

      {chips.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Last Feedback</Text>
          <View style={styles.chipRow}>
            {chips.map((chip) => (
              <Tag key={chip} label={chip} tone="neutral" style={styles.chip} />
            ))}
          </View>
        </View>
      ) : null}

      {/* Only when both halves are present — a card showing one of them has
          nothing to divide. */}
      {chips.length > 0 && comment ? <View style={styles.divider} /> : null}

      {comment ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Comment</Text>
          {/* Set as a quote block — the rep's own words, not app copy. */}
          <View style={styles.quote}>
            <Ionicons
              name="chatbox-ellipses"
              size={14}
              color={Colors.primary}
              style={styles.quoteIcon}
            />
            <Text style={styles.comment}>{comment}</Text>
          </View>
        </View>
      ) : null}
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
  date: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.textMuted,
    marginBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  // Runs the full width of the card — the 16px padding is cancelled so the rule
  // splits the card rather than floating inside it.
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: -16,
    marginVertical: 2,
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
