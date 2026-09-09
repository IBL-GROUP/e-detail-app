import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';

export interface ColumnChartPoint {
  /** Category name shown under the column. */
  label: string;
  value: number;
  /** Text drawn inside the column; defaults to the value. */
  valueLabel?: string;
  /** Text drawn above the column — the raw figure behind the bar. */
  topLabel?: string;
  /**
   * A second, quieter line under the label — for when the category needs both
   * an identifier and a name ("Slide 3" over "EMSYN MET"). Omitted on the
   * breakdowns whose label already says everything.
   */
  subLabel?: string;
}

interface AppColumnChartProps {
  data: ColumnChartPoint[];
  height?: number;
  /** Column fill. One accent for the whole chart, as in the reference. */
  color?: string;
  /** Index of the highlighted column, if any. */
  selectedIndex?: number | null;
  /** Tap handler — enables per-column drill-down. */
  onSelect?: (index: number, point: ColumnChartPoint) => void;
}

/** House style: rounded, single-accent columns with the value inside the bar. */
const BAR_RADIUS = 6;
const ACCENT = '#2BC48A';
const ACCENT_DIM = '#A7E3CB';
/** A column never grows into a slab, nor shrinks below a tappable width. */
const MAX_BAR = 56;
const MIN_BAR = 10;
/** Horizontal rules drawn behind the columns. */
const SECTIONS = 3;
/** Widest a category's slot may get — three bars across a full-width card were
 *  half a screen apart otherwise. */
const MAX_SLOT = 140;
/** Narrowest a slot may get before the chart scrolls instead of squeezing.
 *  Wide enough to hold a full-width bar plus breathing room, so scrolled
 *  columns are the same size as they are when they fit — there's no reason to
 *  thin them down once the run can scroll. */
const MIN_SLOT = MAX_BAR + 40;
/** Room kept above the tallest column for its figure. */
const TOP_LABEL_SPACE = 20;
/** Space under the axis for the category label (two lines at most). */
const LABEL_BLOCK = 34;
/** Extra space when the points also carry a sub-label beneath that. */
const SUB_LABEL_BLOCK = 14;

/**
 * The project's vertical bar chart. Every column chart should go through here so
 * they stay identical — rounded 6px columns, one accent colour, the value inside
 * the bar and the category beneath it.
 *
 * Laid out with flex, not measured pixels: each category owns an equal `flex: 1`
 * slot and its column is centred in it, so the run fills the card exactly at any
 * width. Deriving bar and gap widths from a measurement is what left three
 * columns marooned across a wide card with the last label clipped off the edge.
 *
 * The one thing width decides is the mode. Past MIN_SLOT per column the chart
 * stops squeezing and scrolls horizontally instead, so twenty brands stay as
 * readable as three.
 */
export function AppColumnChart({
  data,
  height = 150,
  color = ACCENT,
  selectedIndex = null,
  onSelect,
}: AppColumnChartProps) {
  const [width, setWidth] = useState(0);
  const grow = useRef(new Animated.Value(0)).current;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) > 1 ? next : current));
  };

  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [grow, data.length]);

  if (data.length === 0) return null;

  const count = data.length;
  // Too many columns for the card: scroll them at a readable width rather than
  // shaving every bar down to a sliver.
  const scrolls = width > 0 && width / count < MIN_SLOT;

  const max = Math.max(...data.map((point) => point.value), 1);
  // The plot floor is the x-axis; the tallest column stops short of the top so
  // its figure has somewhere to sit.
  const usable = Math.max(24, height - TOP_LABEL_SPACE);

  const renderColumn = (point: ColumnChartPoint, index: number) => {
    const isDimmed = selectedIndex != null && selectedIndex !== index;
    const share = point.value / max;
    // A 1% column has no room for text inside it; that label moves above.
    const fitsInside = share >= 0.25;
    const barHeight = Math.max(4, Math.round(share * usable));

    return (
      <Pressable
        key={`${point.label}-${index}`}
        style={scrolls ? [styles.slot, styles.slotFixed] : [styles.slot, styles.slotFlex]}
        onPress={onSelect ? () => onSelect(index, point) : undefined}
      >
        <View style={[styles.column, { height }]}>
          <View style={styles.topLabelBlock}>
            {point.topLabel ? (
              <Text style={styles.topLabel} numberOfLines={1}>
                {point.topLabel}
              </Text>
            ) : null}

            {!fitsInside && point.valueLabel ? (
              <Text style={styles.valueOutside} numberOfLines={1}>
                {point.valueLabel}
              </Text>
            ) : null}
          </View>

          <Animated.View
            style={[
              styles.bar,
              // Scrolled columns keep the full bar width rather than a share of
              // a squeezed slot.
              scrolls && styles.barFixed,
              {
                backgroundColor: isDimmed ? ACCENT_DIM : color,
                height: grow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, barHeight],
                }),
              },
            ]}
          >
            {fitsInside && point.valueLabel ? (
              <Text style={styles.valueInside} numberOfLines={1}>
                {point.valueLabel}
              </Text>
            ) : null}
          </Animated.View>
        </View>

        <Text
          style={styles.axisLabel}
          numberOfLines={point.subLabel ? 1 : 2}
        >
          {point.label}
        </Text>

        {point.subLabel ? (
          <Text style={styles.axisSubLabel} numberOfLines={2}>
            {point.subLabel}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Faint horizontal rules behind the columns, as in the reference. They
          stay put across the card while the columns scroll under them. */}
      <View style={[styles.grid, { height }]} pointerEvents="none">
        {Array.from({ length: SECTIONS }, (_, index) => (
          <View
            key={index}
            style={[styles.rule, { top: (height / SECTIONS) * index }]}
          />
        ))}
      </View>
      <View style={[styles.axis, { top: height }]} pointerEvents="none" />

      {width === 0 ? (
        // One frame before the card has been measured; hold the space so the
        // rules don't flash on their own. A sub-labelled axis is a line taller.
        <View
          style={{
            height:
              height +
              LABEL_BLOCK +
              (data.some((point) => point.subLabel) ? SUB_LABEL_BLOCK : 0),
          }}
        />
      ) : scrolls ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          {data.map(renderColumn)}
        </ScrollView>
      ) : (
        <View style={[styles.row, { maxWidth: count * MAX_SLOT }]}>
          {data.map(renderColumn)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.border,
  },
  axis: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    alignSelf: 'center',
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  slot: {
    alignItems: 'center',
  },
  // Equal share of the card — the columns stay evenly spread at any width.
  slotFlex: {
    flex: 1,
    minWidth: 0,
  },
  // Scrolling: every column keeps a readable width instead of an equal share.
  slotFixed: {
    width: MIN_SLOT,
  },
  // Columns grow from the x-axis, so they bottom-align whatever their height.
  column: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  topLabelBlock: {
    alignItems: 'center',
    marginBottom: 3,
  },
  // The raw figure, sitting above the column.
  topLabel: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  bar: {
    width: '55%',
    maxWidth: MAX_BAR,
    minWidth: MIN_BAR,
    borderTopLeftRadius: BAR_RADIUS,
    borderTopRightRadius: BAR_RADIUS,
    alignItems: 'center',
    overflow: 'hidden',
  },
  barFixed: {
    width: MAX_BAR,
  },
  // Sits just inside the top of the column.
  valueInside: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Too short to hold text — keep the share readable above the column instead.
  valueOutside: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  axisLabel: {
    width: '100%',
    marginTop: 6,
    paddingHorizontal: 2,
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  // The name behind the identifier — quieter, so the axis still reads as a run
  // of "Slide 1, 2, 3" at a glance rather than a wall of product names.
  axisSubLabel: {
    width: '100%',
    marginTop: 1,
    paddingHorizontal: 2,
    color: Colors.textMuted,
    fontSize: 9.5,
    fontWeight: '600',
    opacity: 0.75,
    textAlign: 'center',
  },
});
