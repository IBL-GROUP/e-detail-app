import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

interface CompletedToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

/**
 * "Completed" with a switch beside it. Replaces the Active/Completed segmented
 * control: the two states are one thing being on or off, not two peer choices.
 *
 * Only the switch itself turns green — tinting the whole control made the bar
 * read as an alert. The count lives next to the list title, not here.
 */
export function CompletedToggle({
  value,
  onChange,
  label = 'Completed',
}: CompletedToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.label, value && styles.labelOn]}>{label}</Text>

      {/* Hand-built rather than RN's Switch: it renders at wildly different
          sizes across web/iOS/Android and wouldn't sit level with the label. */}
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Centre, not flex-start: alignSelf overrides the parent's alignItems, so
    // flex-start pinned the control to the top of any row taller than its own
    // 22px switch — the filter group beside it, or a two-line title block.
    alignSelf: 'center',
    gap: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  labelOn: {
    color: Colors.text,
  },
  track: {
    width: 38,
    height: 22,
    borderRadius: 11,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: '#CBD5E1',
  },
  trackOn: {
    backgroundColor: Colors.success,
  },
  knob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignSelf: 'flex-start',
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
});
