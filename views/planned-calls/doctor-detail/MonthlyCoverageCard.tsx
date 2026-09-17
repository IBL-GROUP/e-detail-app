import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { VisitProgress } from '../VisitProgress';

interface MonthlyCoverageCardProps {
  visitCount: number;
  maxVisits?: number | null;
  /** This month's completed calls, by how they were conducted. */
  chamber: number;
  group: number;
  parking: number;
  join: number;
}

/**
 * Whether the doctor's month is covered: the class quota as circles and how many
 * calls are still owed. What those calls consisted of — the kind split, brands,
 * SKUs and timings — is the combined record below, so it isn't repeated here.
 */
export function MonthlyCoverageCard({
  visitCount,
  maxVisits,
  chamber,
  group,
  parking,
  join,
}: MonthlyCoverageCardProps) {
  const total = chamber + group + parking + join;

  // Nothing to report: no quota to track and no calls made.
  if (!maxVisits && total === 0) return null;

  const remaining = maxVisits ? Math.max(maxVisits - visitCount, 0) : 0;

  return (
    <View style={styles.card}>
      {/* The class isn't repeated here — Professional Details above already
          states it, and the quota it drives is spelled out below. */}
      <Text style={styles.title}>This Month&apos;s Calls</Text>

      <VisitProgress visitCount={visitCount} maxVisits={maxVisits} />

      {maxVisits ? (
        <Text style={styles.summary}>
          {remaining > 0
            ? `${remaining} more call${remaining === 1 ? '' : 's'} needed this month.`
            : 'Required calls completed for this month.'}
        </Text>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  summary: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
