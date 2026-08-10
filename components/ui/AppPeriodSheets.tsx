import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

/**
 * The analytics period, split across two controls: WHICH month, and WHICH days
 * inside it. Keeping them separate means the common case — "this month so far"
 * — needs no interaction at all, and narrowing to a few days never risks
 * straddling a month boundary the report can't aggregate over.
 */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function daysInMonth(year: number, month: number) {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

interface TriggerStyles {
  chevronColor?: string;
  triggerStyle?: StyleProp<ViewStyle>;
  triggerContentStyle?: StyleProp<ViewStyle>;
  triggerTextStyle?: StyleProp<TextStyle>;
}

/** Shared bottom-sheet shell: backdrop fade, handle, title. */
function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(backdropOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [backdropOpacity, visible]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}

interface AppMonthSheetProps extends TriggerStyles {
  year: number;
  /** 0-based, like Date#getMonth. */
  month: number;
  onChange: (year: number, month: number) => void;
  /** Nothing after this month can be reported on. Defaults to today. */
  maxDate?: Date;
}

/** Picks the month + year the report covers. */
export function AppMonthSheet({
  year,
  month,
  onChange,
  maxDate,
  chevronColor = Colors.primary,
  triggerStyle,
  triggerContentStyle,
  triggerTextStyle,
}: AppMonthSheetProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  const limit = maxDate ?? new Date();

  const isFuture = (candidateYear: number, candidateMonth: number) =>
    candidateYear > limit.getFullYear() ||
    (candidateYear === limit.getFullYear() && candidateMonth > limit.getMonth());

  return (
    <>
      <Pressable
        onPress={() => {
          setViewYear(year);
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          triggerStyle,
          triggerContentStyle,
          pressed && styles.triggerPressed,
        ]}
      >
        <Ionicons name="calendar-outline" size={16} color={chevronColor} />
        <Text style={[styles.triggerText, triggerTextStyle]}>
          {MONTHS_SHORT[month]} {year}
        </Text>
        <Ionicons name="chevron-down" size={18} color={chevronColor} />
      </Pressable>

      <Sheet visible={open} title="Select Month" onClose={() => setOpen(false)}>
        <View style={styles.yearRow}>
          <Pressable
            onPress={() => setViewYear((current) => current - 1)}
            style={styles.yearStep}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.primary} />
          </Pressable>
          <Text style={styles.yearLabel}>{viewYear}</Text>
          <Pressable
            onPress={() => setViewYear((current) => current + 1)}
            disabled={viewYear >= limit.getFullYear()}
            style={[
              styles.yearStep,
              viewYear >= limit.getFullYear() && styles.disabled,
            ]}
          >
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </Pressable>
        </View>

        <View style={styles.monthGrid}>
          {MONTHS_SHORT.map((label, index) => {
            const selected = viewYear === year && index === month;
            const blocked = isFuture(viewYear, index);

            return (
              <Pressable
                key={label}
                disabled={blocked}
                onPress={() => {
                  onChange(viewYear, index);
                  setOpen(false);
                }}
                style={[
                  styles.monthCell,
                  selected && styles.cellSelected,
                  blocked && styles.disabled,
                ]}
              >
                <Text style={[styles.monthText, selected && styles.cellTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

interface AppDayRangeSheetProps extends TriggerStyles {
  year: number;
  month: number;
  fromDay: number;
  toDay: number;
  onChange: (fromDay: number, toDay: number) => void;
  /** Nothing after this date can be reported on. Defaults to today. */
  maxDate?: Date;
}

/** Picks the day range inside the chosen month. */
export function AppDayRangeSheet({
  year,
  month,
  fromDay,
  toDay,
  onChange,
  maxDate,
  chevronColor = Colors.primary,
  triggerStyle,
  triggerContentStyle,
  triggerTextStyle,
}: AppDayRangeSheetProps) {
  const [open, setOpen] = useState(false);
  // First tap of a new range; the second tap closes it.
  const [pendingFrom, setPendingFrom] = useState<number | null>(null);

  const limit = maxDate ?? new Date();
  const total = daysInMonth(year, month);
  // Days that haven't happened yet have nothing to report.
  const lastSelectable =
    year === limit.getFullYear() && month === limit.getMonth()
      ? limit.getDate()
      : total;

  const handleDay = (day: number) => {
    if (pendingFrom == null) {
      setPendingFrom(day);
      return;
    }

    const start = Math.min(pendingFrom, day);
    const end = Math.max(pendingFrom, day);
    setPendingFrom(null);
    onChange(start, end);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => {
          setPendingFrom(null);
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          triggerStyle,
          triggerContentStyle,
          pressed && styles.triggerPressed,
        ]}
      >
        <Ionicons name="today-outline" size={16} color={chevronColor} />
        <Text style={[styles.triggerText, triggerTextStyle]}>
          {fromDay === toDay ? `${fromDay}` : `${fromDay} – ${toDay}`}
        </Text>
        <Ionicons name="chevron-down" size={18} color={chevronColor} />
      </Pressable>

      <Sheet
        visible={open}
        title={`Days in ${MONTHS_SHORT[month]} ${year}`}
        onClose={() => setOpen(false)}
      >
        <Text style={styles.hint}>
          {pendingFrom == null
            ? 'Tap the first day of the range.'
            : `From ${pendingFrom} — now tap the last day.`}
        </Text>

        <ScrollView style={styles.dayScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.dayGrid}>
            {Array.from({ length: total }, (_, index) => index + 1).map((day) => {
              const blocked = day > lastSelectable;
              const inRange =
                pendingFrom == null && day >= fromDay && day <= toDay;
              const isPending = pendingFrom === day;

              return (
                <Pressable
                  key={day}
                  disabled={blocked}
                  onPress={() => handleDay(day)}
                  style={[
                    styles.dayCell,
                    (inRange || isPending) && styles.cellSelected,
                    blocked && styles.disabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      (inRange || isPending) && styles.cellTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <Pressable
          onPress={() => {
            setPendingFrom(null);
            onChange(1, lastSelectable);
            setOpen(false);
          }}
          style={styles.resetButton}
        >
          <Text style={styles.resetText}>Whole month to date</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triggerPressed: {
    opacity: 0.75,
  },
  triggerText: {
    flex: 1,
    minWidth: 0,
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: Colors.textMuted,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  yearStep: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
  },
  yearLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    minWidth: 72,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 4,
  },
  monthCell: {
    width: '22%',
    flexGrow: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  monthText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dayScroll: {
    maxHeight: 320,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 4,
  },
  dayCell: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  cellSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  cellTextSelected: {
    color: Colors.textOnDark,
  },
  disabled: {
    opacity: 0.35,
  },
  resetButton: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
});
