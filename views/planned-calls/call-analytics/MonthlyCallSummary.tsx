import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Tag } from '@/components/tag';
import { AppColumnChart } from '@/components/ui/AppColumnChart';
import { Colors } from '@/constants/theme';
import { useDoctorCallSummary, type DoctorCallRecord } from '@/api/calls';

interface MonthlyCallSummaryProps {
  mieId?: string;
  doctorId?: string;
  /** Narrows the report to one call kind (chamber / group / parking). */
  kind?: string;
}

const KINDS = [
  { key: 'chamber', label: 'Chamber', icon: 'person-outline' },
  { key: 'group', label: 'Group', icon: 'people-outline' },
  { key: 'parking', label: 'Parking', icon: 'car-outline' },
] as const;

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Time spent per brand (or per SKU) across the month. The bars ARE the list —
 * naming the same items again as chips above them only repeated information and
 * pushed everything else down.
 */
function TimeBreakdown({
  entries,
  fallbackNames,
  calls,
  unit,
}: {
  entries: { name: string; seconds: number }[];
  /** Shown when no timings were recorded (older calls). */
  fallbackNames: string[];
  /** Used to work out how many calls each entry appeared in. */
  calls: DoctorCallRecord[];
  unit: 'brand' | 'sku';
}) {
  const [selected, setSelected] = useState<number | null>(null);
  if (entries.length === 0) {
    if (fallbackNames.length === 0) {
      return <Text style={styles.emptyText}>Nothing recorded against these calls.</Text>;
    }

    return (
      <View style={styles.chipRow}>
        {fallbackNames.map((name) => (
          <Tag key={name} label={name} tone="neutral" />
        ))}
      </View>
    );
  }

  const total = entries.reduce((sum, entry) => sum + entry.seconds, 0) || 1;
  const active = selected != null ? entries[selected] : null;

  // How many of the month's calls this brand/SKU was actually detailed in.
  const callsWith = (name: string) =>
    calls.filter((call) =>
      (unit === 'brand' ? call.brands : call.skus).includes(name)
    ).length;

  const activeCalls = active ? callsWith(active.name) : 0;

  return (
    <View style={styles.breakdownList}>
      <AppColumnChart
        data={entries.map((entry) => ({
          label: entry.name,
          value: entry.seconds,
          // Time above the column, share of the month inside it.
          topLabel: formatDuration(entry.seconds),
          valueLabel: `${Math.round((entry.seconds / total) * 100)}%`,
        }))}
        selectedIndex={selected}
        onSelect={(index) => setSelected((current) => (current === index ? null : index))}
      />

      {active ? (
        // Drill-down for the tapped column.
        <View style={styles.detailPanel}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailName} numberOfLines={1}>
              {active.name}
            </Text>
            <Tag label={`${Math.round((active.seconds / total) * 100)}% of time`} tone="success" />
          </View>

          <View style={styles.detailStats}>
            <View style={styles.detailStat}>
              <Text style={styles.detailValue}>{formatDuration(active.seconds)}</Text>
              <Text style={styles.detailLabel}>Total time</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailStat}>
              <Text style={styles.detailValue}>{activeCalls}</Text>
              <Text style={styles.detailLabel}>Calls shown in</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailStat}>
              <Text style={styles.detailValue}>
                {formatDuration(Math.round(active.seconds / Math.max(activeCalls, 1)))}
              </Text>
              <Text style={styles.detailLabel}>Avg per call</Text>
            </View>
          </View>
        </View>
      ) : (
        <Text style={styles.hintText}>Tap a column for its breakdown.</Text>
      )}
    </View>
  );
}

/** One recorded call in the history list. */
function CallRow({ call }: { call: DoctorCallRecord }) {
  const detailed = [...call.brands, ...call.skus];

  return (
    <View style={styles.callRow}>
      <View style={styles.callTop}>
        <Text style={styles.callDate}>{formatDate(call.date)}</Text>
        {call.kind ? <Tag label={call.kind} tone="neutral" /> : null}
        <View style={styles.spacer} />
        <Text style={styles.callMeta}>
          {formatDuration(call.durationSeconds)} · {call.slidesShown}/{call.slidesTotal} slides
        </Text>
      </View>

      {detailed.length > 0 ? (
        <Text style={styles.callBrands} numberOfLines={2}>
          {detailed.join(' · ')}
        </Text>
      ) : null}

      {call.feedback ? (
        <Text style={styles.callFeedback} numberOfLines={2}>
          {call.feedback}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The full picture behind a completed doctor: every call made this month, how
 * they were conducted, how much content was shown, and where the time went.
 * Split across several cards — one tall card made every section compete for the
 * same space.
 */
export function MonthlyCallSummary({
  mieId,
  doctorId,
  kind,
}: MonthlyCallSummaryProps) {
  const { width } = useWindowDimensions();
  const query = useDoctorCallSummary(mieId, doctorId, kind);

  // Side by side once there's room; the bars are unreadable much narrower.
  const isWide = width >= 900;

  if (!mieId || !doctorId) return null;

  // `data` is the server's report with this device's not-yet-uploaded calls
  // merged in, so it can be present while the fetch is still loading or failed
  // outright — offline, the ledger IS the report. Only fall back to a state
  // message when there is genuinely nothing to show.
  if (query.isLoading && !query.data?.summary) {
    return (
      <View style={[styles.card, styles.centered]}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.stateText}>Loading call history...</Text>
      </View>
    );
  }

  if (!query.data?.summary) {
    return (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.stateText}>Call history unavailable offline.</Text>
      </View>
    );
  }

  const { summary, calls } = query.data;

  if (summary.totalCalls === 0) {
    return (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.stateText}>
          {kind
            ? `No completed ${kind} calls recorded this month.`
            : 'No completed calls recorded this month.'}
        </Text>
      </View>
    );
  }

  const hasSkus = summary.skus.length > 0;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.title}>
            {kind ? `This Month's ${kind} Calls` : "This Month's Activity"}
          </Text>
          <View style={styles.spacer} />
          <Tag
            label={`${summary.totalCalls} call${summary.totalCalls === 1 ? '' : 's'}`}
            tone="primary"
          />
        </View>

        {/* The kind split only says something when every kind is in scope. */}
        {!kind ? (
          <View style={styles.kindPanel}>
            {KINDS.map((entry, index) => (
              <View key={entry.key} style={styles.kindCell}>
                {index > 0 ? <View style={styles.kindSeparator} /> : null}
                <View style={styles.kindInner}>
                  <View style={styles.kindHeader}>
                    <Ionicons name={entry.icon} size={14} color={Colors.primary} />
                    <Text style={styles.kindLabel}>{entry.label}</Text>
                  </View>
                  <Text style={styles.kindCount}>{summary.byKind[entry.key]}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.statPanel}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Total time</Text>
            <Text style={styles.statValue}>{formatDuration(summary.durationSeconds)}</Text>
          </View>
          <View style={styles.statSeparator} />
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Slides shown</Text>
            <Text style={styles.statValue}>
              {summary.slidesShown}/{summary.slidesTotal}
            </Text>
          </View>
          <View style={styles.statSeparator} />
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Samples</Text>
            <Text style={styles.statValue}>{summary.samplesProvided}</Text>
          </View>
        </View>
      </View>

      {/* Brands and SKUs sit side by side on a wide screen — stacked they left
          the whole right half of the card empty. */}
      <View style={[styles.splitRow, !isWide && styles.splitColumn]}>
        <View style={[styles.card, styles.splitCell]}>
          <View style={styles.header}>
            <Ionicons name="cube-outline" size={16} color={Colors.primary} />
            <Text style={styles.title}>Time per Brand</Text>
            <View style={styles.spacer} />
            {/* Count what's actually charted: older calls have timings but no
                recorded brand list, which showed "0" above three bars. */}
            <Text style={styles.headerCount}>
              {(summary.brandTimes ?? []).length || summary.brands.length}
            </Text>
          </View>

          <TimeBreakdown
            entries={summary.brandTimes ?? []}
            fallbackNames={summary.brands}
            calls={calls}
            unit="brand"
          />
        </View>

        {hasSkus ? (
          <View style={[styles.card, styles.splitCell]}>
            <View style={styles.header}>
              <Ionicons name="pricetag-outline" size={16} color={Colors.primary} />
              <Text style={styles.title}>Time per SKU</Text>
              <View style={styles.spacer} />
              <Text style={styles.headerCount}>
                {(summary.skuTimes ?? []).length || summary.skus.length}
              </Text>
            </View>

            <TimeBreakdown
              entries={summary.skuTimes ?? []}
              fallbackNames={summary.skus}
              calls={calls}
              unit="sku"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="list-outline" size={16} color={Colors.primary} />
          <Text style={styles.title}>Calls</Text>
          <View style={styles.spacer} />
          <Text style={styles.headerCount}>{calls.length}</Text>
        </View>

        <View style={styles.callList}>
          {calls.map((call) => (
            <CallRow key={call.callId} call={call} />
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 14,
  },
  splitColumn: {
    flexDirection: 'column',
  },
  splitCell: {
    flex: 1,
    minWidth: 0,
  },
  centered: {
    alignItems: 'center',
    gap: 8,
  },
  stateText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  headerCount: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textMuted,
  },
  spacer: {
    flex: 1,
  },
  kindPanel: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  kindCell: {
    flex: 1,
    flexDirection: 'row',
  },
  kindSeparator: {
    width: 1,
    backgroundColor: Colors.border,
  },
  kindInner: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  kindHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  kindLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  kindCount: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  statPanel: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statSeparator: {
    width: 1,
    backgroundColor: Colors.border,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  breakdownList: {
    gap: 12,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  detailPanel: {
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  detailStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  detailDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.border,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  callList: {
    gap: 8,
  },
  callRow: {
    gap: 4,
    borderRadius: 10,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  callTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callDate: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  callMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  callBrands: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  callFeedback: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
