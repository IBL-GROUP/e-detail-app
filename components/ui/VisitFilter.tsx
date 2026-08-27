import { StyleSheet, Text, View } from 'react-native';

import {
  AppSegmentedToggle,
  type SegmentedOption,
} from '@/components/ui/AppSegmentedToggle';
import { Colors } from '@/constants/theme';

/**
 * All / Visited / Unvisited / Completed, over a rep's own doctors.
 *
 * ONE control, not a filter plus a switch. Completed used to sit beside these as
 * its own toggle, which read as an independent axis it never was: a doctor whose
 * month is finished is not "visited and also completed", they are simply done.
 * As four segments the choice is exclusive and the list can only be showing one
 * of them.
 *
 * Shared by Call Reporting and the Doctor List so the two can never disagree on
 * what any of these mean — they read the same list and a rep moving between them
 * would notice immediately.
 */
export const DOCTOR_FILTERS = {
  all: 'all',
  visited: 'visited',
  unvisited: 'unvisited',
  completed: 'completed',
} as const;

export type DoctorFilter = (typeof DOCTOR_FILTERS)[keyof typeof DOCTOR_FILTERS];

/** Labels are separate from the stored keys, so renaming one cannot break the filter. */
const VISIT_STATES: SegmentedOption<DoctorFilter>[] = [
  { key: DOCTOR_FILTERS.visited, label: 'Visited' },
  { key: DOCTOR_FILTERS.unvisited, label: 'Unvisited' },
];

const ALL_OPTION: SegmentedOption<DoctorFilter> = {
  key: DOCTOR_FILTERS.all,
  label: 'All',
};

const COMPLETED_OPTION: SegmentedOption<DoctorFilter> = {
  key: DOCTOR_FILTERS.completed,
  label: 'Completed',
};

/**
 * Whether a doctor passes the selected filter.
 *
 * `isCompleted` is supplied by the caller because the two screens mean different
 * things by it: the Doctor List asks whether the month's quota is met at all,
 * while Call Reporting also requires a call OF THE SELECTED KIND, so a doctor
 * finished in the chamber does not read as completed under Parking.
 *
 * Visited = AT LEAST ONE call this month AND not yet finished. Deliberately not
 * "any call ever made", so the three states partition the book: not started, in
 * progress, done. `visitCount` already folds in calls sitting in this device's
 * outbox, so a call made minutes ago with no signal moves a doctor out of
 * Unvisited straight away.
 */
export function matchesDoctorFilter<T extends { visitCount?: number | null }>(
  doctor: T,
  filter: DoctorFilter,
  isCompleted: (doctor: T) => boolean
): boolean {
  if (filter === DOCTOR_FILTERS.all) return true;

  const done = isCompleted(doctor);
  if (filter === DOCTOR_FILTERS.completed) return done;
  // A finished doctor is neither Visited nor Unvisited: they have their own
  // segment, and counting them twice would put the parts above the whole.
  if (done) return false;

  const visited = (doctor.visitCount ?? 0) > 0;
  return filter === DOCTOR_FILTERS.visited ? visited : !visited;
}

interface DoctorFilterGroupProps {
  value: DoctorFilter;
  onChange: (next: DoctorFilter) => void;
  /**
   * Whether Visited / Unvisited are offered.
   *
   * Off for a group call, whose list is every assigned doctor rather than a
   * per-doctor worklist — "has this one been visited" is not a question it
   * answers. All and Completed still are.
   */
  visitStates?: boolean;
  /** Names what is being filtered; the group alone does not say. */
  label?: string;
}

export function DoctorFilterGroup({
  value,
  onChange,
  visitStates = true,
  label = 'Doctors',
}: DoctorFilterGroupProps) {
  const options = visitStates
    ? [ALL_OPTION, ...VISIT_STATES, COMPLETED_OPTION]
    : [ALL_OPTION, COMPLETED_OPTION];

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
  // Tighter than the gap to whatever sits beside it, so the label reads as
  // belonging to the group rather than floating between the two.
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
