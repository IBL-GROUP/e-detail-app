import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * Placeholder blocks shown while a slow query is in flight.
 *
 * The Sales view reads the data warehouse through a foreign table and takes the
 * better part of a minute on a cold period. Rendering zeroes in the meantime is
 * worse than rendering nothing: "0" is a number, and a rep has no way to tell a
 * genuinely empty period from one that simply hasn't arrived. A pulsing block is
 * unambiguously "not yet".
 */

/** One shimmering block. Give it a width/height like any other View. */
export function AppSkeleton({
  width,
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  // A single shared driver per block — cheap, and native-driven so the long wait
  // doesn't stutter when the JS thread is busy parsing the response.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.block,
        { height, borderRadius: radius },
        width != null ? { width } : styles.fill,
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }) },
        style,
      ]}
    />
  );
}

/** A stat box's worth: the small label line above, the big value below. */
export function AppSkeletonStat({ labelWidth = 70 }: { labelWidth?: number }) {
  return (
    <View style={styles.statGroup}>
      <AppSkeleton width={labelWidth} height={9} radius={4} />
      <AppSkeleton width={92} height={22} radius={6} />
    </View>
  );
}

/**
 * A bar chart's silhouette — staggered heights so it reads as a chart rather
 * than a block, and sits at the same height the real chart will occupy so the
 * card doesn't resize when the data lands.
 */
export function AppSkeletonChart({
  bars = 5,
  height = 210,
}: {
  bars?: number;
  height?: number;
}) {
  // Fixed pattern, not random: a shape that changes on every re-render reads as
  // flickering rather than loading.
  const heights = [0.9, 0.62, 0.45, 0.72, 0.33, 0.55, 0.4, 0.28];

  return (
    <View style={[styles.chart, { height }]}>
      {Array.from({ length: bars }).map((_, index) => (
        <View key={index} style={styles.chartColumn}>
          <AppSkeleton
            height={Math.round((height - 34) * heights[index % heights.length])}
            radius={6}
          />
          <AppSkeleton width={34} height={8} radius={4} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#CBD5E1',
  },
  fill: {
    alignSelf: 'stretch',
  },
  statGroup: {
    gap: 8,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 8,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
});
