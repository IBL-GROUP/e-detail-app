import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

// 'neutral' is for figures that aren't good or bad news — progress through a
// target, say, which is simply low early in the month.
type MetricTone = 'positive' | 'negative' | 'neutral';

interface AppMetricCardProps {
  label: string;
  value: string;
  pill?: string;
  /**
   * A small caption sitting above the pill, naming what the percentage IS.
   * Some cards carry a pill whose meaning isn't obvious from the card's own
   * label — Call / Planned's percentage is the rep's RFI — and a number with no
   * name beside a different number is guesswork.
   */
  pillCaption?: string;
  tone?: MetricTone;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppMetricCard({
  label,
  value,
  pill,
  pillCaption,
  tone = 'positive',
  icon,
  accent = Colors.primary,
  style,
}: AppMetricCardProps) {
  const pillStyle = {
    positive: styles.pillPositive,
    negative: styles.pillNegative,
    neutral: styles.pillNeutral,
  }[tone];
  const pillTextStyle = {
    positive: styles.pillTextPositive,
    negative: styles.pillTextNegative,
    neutral: styles.pillTextNeutral,
  }[tone];

  return (
    <View style={[styles.card, style]}>
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: `${accent}12` }]}>
          <Ionicons name={icon} size={20} color={accent} />
        </View>
      )}

      {/* The caption heads its own column: it sits on the label's line, over the
          pill, so the card reads as two labelled figures side by side rather
          than one figure with a stray word above its badge. */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {pill && pillCaption ? (
          <Text style={styles.pillCaption} numberOfLines={1}>
            {pillCaption}
          </Text>
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {pill && (
          <View style={[styles.pill, pillStyle]}>
            <Text style={[styles.pillText, pillTextStyle]}>{pill}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    padding: 16,
    minHeight: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    // Top-aligned, so the caption stays on the label's FIRST line when the label
    // beside it wraps to two.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  label: {
    // Gives up the width; the caption is short and keeps its own.
    flexShrink: 1,
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 18,
    // Headroom above a single line, so the label block keeps a consistent depth
    // across the row without reserving the full two lines a wrapping label takes.
    minHeight: 28,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  value: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '800',
  },
  // Reads as a peer of the card's own label, because that is what it is — the
  // heading for the figure in the pill below it. Same type as `label`.
  pillCaption: {
    flexShrink: 0,
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 18,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
  },
  pillPositive: {
    backgroundColor: Colors.successBg,
  },
  pillNegative: {
    backgroundColor: Colors.dangerBg,
  },
  // Same blue chip the Call Reporting header uses for its count.
  pillNeutral: {
    backgroundColor: Colors.primaryLight,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '800',
  },
  pillTextPositive: {
    color: Colors.success,
  },
  pillTextNegative: {
    color: Colors.danger,
  },
  pillTextNeutral: {
    color: Colors.secondary,
  },
});
