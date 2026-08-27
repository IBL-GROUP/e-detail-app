import { StyleSheet, Text, View } from 'react-native';

import {
  AppSegmentedToggle,
  type SegmentedOption,
} from '@/components/ui/AppSegmentedToggle';
import { Colors } from '@/constants/theme';

/**
 * Filters a doctor book by class — A1..A4, whichever of them the rep actually
 * carries.
 *
 * Shared by Call Reporting and the Doctor List, alongside the visit filter, so
 * the two screens cannot disagree about which class a doctor is in.
 */
export const ALL_CLASSES = 'all';

export type ClassFilter = string;

/** A class the mapper could not read comes through as this, not as a class. */
const NO_CLASS = '-';

/**
 * The classes PRESENT in the loaded book, sorted.
 *
 * Derived from the rows rather than from a fixed A1..A4 list: a rep who carries
 * no A1 should not be offered one, and picking it would only ever empty the
 * list. It also means a class added to the model later needs no change here.
 */
export function classesIn(doctors: { doctorClass?: string | null }[]): string[] {
  const found = new Set<string>();
  for (const doctor of doctors) {
    const value = String(doctor.doctorClass ?? '').trim();
    if (!value || value === NO_CLASS) continue;
    found.add(value);
  }
  // Numeric-aware so A10 would sort after A9 rather than between A1 and A2.
  return [...found].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/** `all` keeps everyone, including the doctors carrying no class at all. */
export function matchesClassFilter(
  doctor: { doctorClass?: string | null },
  filter: ClassFilter
): boolean {
  if (filter === ALL_CLASSES) return true;
  return String(doctor.doctorClass ?? '').trim() === filter;
}

interface ClassFilterGroupProps {
  /** The classes to offer — from `classesIn` over the unfiltered book. */
  classes: string[];
  value: ClassFilter;
  onChange: (next: ClassFilter) => void;
  label?: string;
}

export function ClassFilterGroup({
  classes,
  value,
  onChange,
  label = 'Class',
}: ClassFilterGroupProps) {
  // One class is not a choice, and none at all is not a control.
  if (classes.length < 2) return null;

  const options: SegmentedOption<string>[] = [
    { key: ALL_CLASSES, label: 'All' },
    ...classes.map((name) => ({ key: name, label: name })),
  ];

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <AppSegmentedToggle
        options={options}
        value={value}
        onChange={onChange}
        variant="box"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
});
