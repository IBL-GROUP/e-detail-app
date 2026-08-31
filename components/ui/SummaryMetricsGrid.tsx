import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { AppMetricCard } from '@/components/ui/AppMetricCard';
import type { SummaryMetric } from '@/lib/analytics/summaryMetrics';

// Below this the four cards get too narrow to read (labels wrap to two lines and
// the value collides with its pill), so they fall back to 2x2.
const WIDE_BREAKPOINT = 760;

interface SummaryMetricsGridProps {
  metrics: readonly SummaryMetric[];
  style?: ViewStyle;
}

/**
 * The headline figures on Analytics — whichever set it's handed, so the call and
 * sales views share one row. All across on a wide screen, 2-up on a phone.
 */
export function SummaryMetricsGrid({ metrics, style }: SummaryMetricsGridProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  return (
    <View style={[styles.grid, style]}>
      {metrics.map((metric) => (
        <View
          key={metric.label}
          style={[styles.cell, isWide ? styles.cellWide : styles.cellNarrow]}
        >
          <AppMetricCard
            label={metric.label}
            value={metric.value}
            pill={metric.change}
            pillCaption={metric.pillCaption}
            tone={metric.tone}
            style={styles.cardFill}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    minWidth: 0,
  },
  // Two per row, accounting for the 12px gap between them.
  cellNarrow: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  cellWide: {
    flex: 1,
    flexBasis: 0,
  },
  // Fill the stretched cell so cards in a row match the tallest.
  cardFill: {
    flex: 1,
  },
});
