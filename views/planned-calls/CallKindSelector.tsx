import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import { CALL_KIND_LABELS, type CallKind } from './callTypes';

/**
 * Which family the glyph comes from.
 *
 * Ionicons has no three-person icon — `people-outline` is two, which read as a
 * pair rather than a group beside the single-person Chamber icon. Material's
 * `account-group-outline` is the three-person one, so Group borrows it — and
 * the two-person Ionicon goes to Join Call, which IS a pair: the rep with
 * someone sitting in alongside them.
 */
type KindIcon =
  | { family: 'ion'; name: keyof typeof Ionicons.glyphMap }
  | { family: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap };

const CALL_KINDS: {
  key: CallKind;
  label: string;
  icon: KindIcon;
}[] = [
  {
    key: 'chamber',
    label: CALL_KIND_LABELS.chamber,
    icon: { family: 'ion', name: 'person-outline' },
  },
  {
    key: 'group',
    label: CALL_KIND_LABELS.group,
    icon: { family: 'mci', name: 'account-group-outline' },
  },
  {
    key: 'parking',
    label: CALL_KIND_LABELS.parking,
    // A walking figure, not a car: the rep walks in on the doctor rather than
    // parking outside.
    icon: { family: 'ion', name: 'walk-outline' },
  },
  {
    key: 'join',
    label: CALL_KIND_LABELS.join,
    // Two people: the rep and whoever is sitting in with them.
    icon: { family: 'ion', name: 'people-outline' },
  },
];

interface CallKindSelectorProps {
  value: CallKind;
  onChange: (kind: CallKind) => void;
  style?: ViewStyle;
}

/**
 * Chamber / Group / Walking / Join Call. Shown for both territory and
 * institution modes — a rep can make any of them from either.
 */
export function CallKindSelector({ value, onChange, style }: CallKindSelectorProps) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardLabel}>Call Type</Text>
      <View style={styles.segment}>
        {CALL_KINDS.map((option) => {
          const isActive = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              style={({ pressed }) => [
                styles.segmentButton,
                isActive && styles.segmentButtonActive,
                pressed && styles.pressed,
              ]}
            >
              {option.icon.family === 'mci' ? (
                <MaterialCommunityIcons
                  name={option.icon.name}
                  // Material's glyphs read a touch smaller at the same nominal
                  // size, so it's bumped to sit level with the Ionicons ones.
                  size={22}
                  color={isActive ? Colors.textOnDark : Colors.primary}
                />
              ) : (
                <Ionicons
                  name={option.icon.name}
                  size={20}
                  color={isActive ? Colors.textOnDark : Colors.primary}
                />
              )}
              <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  segment: {
    flexDirection: 'row',
    gap: 10,
  },
  // Icon over label, so all four sit on ONE row without truncating. The gap
  // between tiles is the only fixed width here, so each takes an equal share of
  // whatever is left.
  segmentButton: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  segmentButtonActive: {
    backgroundColor: Colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  segmentText: {
    color: Colors.primary,
    // A point down from 14: four tiles across a narrow phone leave "Join Call"
    // about 80px, and at 14 it was close enough to the edge to wrap on the
    // smallest screens — which made one tile taller than the other three.
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: Colors.textOnDark,
  },
});
