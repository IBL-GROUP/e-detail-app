import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * `pill` is the standalone control: rounded, roomy, carries a section on its own.
 * `box` is the inline one — squared corners and a shorter body so it can sit on a
 * header row next to a title or a switch without dominating it.
 */
export type SegmentedVariant = 'pill' | 'box';

interface AppSegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  variant?: SegmentedVariant;
  style?: ViewStyle;
}

/**
 * A compact switch between views: a soft track with the active option riding in
 * it as a filled pill. Sized to its labels and left-aligned rather than stretched
 * across the screen — it picks a view, so it shouldn't carry the visual weight of
 * a primary action.
 */
export function AppSegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
  style,
}: AppSegmentedToggleProps<T>) {
  const box = variant === 'box';
  return (
    <View style={[styles.track, box && styles.trackBox, style]}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.pill,
              box && styles.pillBox,
              active && styles.pillActive,
              active && box && styles.pillActiveBox,
              pressed && !active && styles.pressed,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={box ? 14 : 16}
                color={active ? Colors.textOnDark : Colors.textMuted}
              />
            ) : null}
            <Text
              style={[styles.label, box && styles.labelBox, active && styles.labelActive]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#EDF1F7',
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  trackBox: {
    // 4 (the segment radius) + 2 (the track inset) keeps the two curves concentric.
    borderRadius: 6,
    padding: 2,
    gap: 2,
    height: 34,
    // The pill variant stands alone in a column, where flex-start stops it
    // stretching to full width. The box variant sits in a header row instead,
    // where flex-start would override alignItems and pin it to the top.
    alignSelf: 'center',
  },
  pill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  pillBox: {
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 4,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  pillActiveBox: {
    // A shorter segment can't carry the pill's drop shadow without looking smudged.
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: Colors.textMuted,
    // Android pads the line box asymmetrically by default, which sits the label
    // off-centre between the segment's top and bottom edge — visible once the
    // box variant tightens the padding to 5.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  labelBox: {
    fontSize: 13,
    lineHeight: 16,
  },
  labelActive: {
    color: Colors.textOnDark,
  },
});
