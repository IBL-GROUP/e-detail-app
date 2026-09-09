import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

interface AppChartEmptyProps {
  /** What is missing, in one short line. No trailing full stop. */
  message: string;
  /** Defaults to a bar-chart glyph — override where another reads truer. */
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * Matched to the chart it stands in for, so a card is the same height empty
   * as it is full and the page doesn't jump when a period changes.
   */
  height?: number;
}

/**
 * What a chart card shows when it has nothing to plot.
 *
 * A line of grey text pinned to the top-left of a card sized for a chart read
 * as a rendering failure — the card kept its height, so most of it was blank
 * space with a sentence stranded above it. Centring the message in that space
 * and giving it a glyph makes the emptiness look deliberate, which is the
 * point: "nothing here" is an answer, and it should look like one.
 */
export function AppChartEmpty({
  message,
  icon = 'bar-chart-outline',
  height = 210,
}: AppChartEmptyProps) {
  return (
    <View style={[styles.wrap, { minHeight: height }]}>
      <View style={styles.badge}>
        <Ionicons name={icon} size={22} color={Colors.textMuted} />
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  // A soft disc behind the glyph, so the icon reads as placed rather than as a
  // stray symbol floating in the card.
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  message: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    // Long enough to hold a specialty name without wrapping to three lines,
    // short enough that the text stays a caption rather than a paragraph.
    maxWidth: 260,
  },
});
