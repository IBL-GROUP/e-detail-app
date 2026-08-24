import { useDoctorCallSummary } from '@/api/calls';
import { Tag } from '@/components/tag';
import { AppColumnChart } from '@/components/ui/AppColumnChart';
import { AppMetricCard } from '@/components/ui/AppMetricCard';
import { Colors } from '@/constants/theme';
import { queueReturnToNewDoctor } from '@/views/unplanned-calls/returnToNewDoctorStore';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CALL_KIND_LABELS, CallType, type CallKind } from '../callTypes';
import { MonthlyCallSummary } from './MonthlyCallSummary';

/**
 * 'single'   — the report for the call just ended: that call's slides, brands,
 *              SKUs and how it was conducted.
 * 'combined' — opened from the Completed list, where no single call is in
 *              context: everything the rep has done with this doctor this month,
 *              rolled up.
 */
export type AnalyticsMode = 'single' | 'combined';

interface CallAnalyticsProps {
  doctorName?: string;
  /** Needed to pull the month's real call history for this doctor. */
  doctorId?: string;
  mieId?: string;
  mode?: AnalyticsMode;
  /** Chamber / group / walking — for the single-call report. */
  callKind?: string;
  callType?: CallType;
  durationSeconds: number;
  // The previous call's duration, to show how much longer/shorter this one was.
  // Undefined = no prior call this session (shows "First call").
  previousDurationSeconds?: number;
  slidesViewed: number;
  totalSlides: number;
  feedback: string;
  doctorInterest?: 'High' | 'Medium' | 'Low';
  slideTimes: number[];
  slideLabels?: string[];
  /** Seconds per brand — drives the chart. */
  brandTimes?: { name: string; seconds: number }[];
  /** Seconds per SKU — drives the rows under it. Empty for brand-wise forcing. */
  skuTimes?: { name: string; seconds: number }[];
  returnToNewDoctor?: boolean;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

function formatSlideTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes === 0) return `${remainingSeconds}s`;

  return `${minutes}m ${remainingSeconds}s`;
}

function getBrandLabel(index: number) {
  return `Brand ${index + 1}`;
}

function getSlideLabel(labels: string[] | undefined, index: number) {
  return labels?.[index] || getBrandLabel(index);
}

function splitSlideLabel(label: string) {
  if (label.includes(' - ')) {
    const [primary, ...rest] = label.split(' - ');
    return {
      primary: primary?.trim() || label,
      secondary: rest.join(' - ').trim(),
    };
  }

  if (label.includes('·')) {
    const [primary, ...rest] = label.split('·');
    return {
      primary: primary?.trim() || label,
      secondary: rest.join('·').trim(),
    };
  }

  if (label.includes('Â·')) {
    const [primary, ...rest] = label.split('Â·');
    return {
      primary: primary?.trim() || label,
      secondary: rest.join('Â·').trim(),
    };
  }

  return {
    primary: label,
    secondary: '',
  };
}

function parseFeedbackTags(feedback: string) {
  return feedback
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDoctorInterest(feedback: string, doctorInterest?: 'High' | 'Medium' | 'Low') {
  if (doctorInterest) {
    return doctorInterest;
  }

  const tags = parseFeedbackTags(feedback);

  // 'Not Interested' and 'Requested Literature' are no longer offered, but calls
  // already recorded with them still have to read correctly — this maps stored
  // feedback, so dropping them would silently reclassify past calls.
  if (tags.includes('Not Interested')) {
    return 'Low';
  }

  if (
    tags.some((tag) =>
      [
        'Interested',
        'Need Follow-up',
        'Asked for Samples',
        'Requested Literature',
        'Next Visit Planned',
        // The doctor is asking for something to happen — as strong a signal as
        // asking for samples.
        'Plan Camp',
        'Requested for Activity',
      ].includes(tag)
    )
  ) {
    return 'High';
  }

  if (
    tags.some((tag) =>
      [
        'Price Concern',
        'Competitor Mentioned',
        // Writing someone else's brand is a competitive obstacle, not a refusal.
        'Prescribing Other Brands',
      ].includes(tag)
    )
  ) {
    return 'Medium';
  }

  return 'Medium';
}

function getFeedbackToneLabel(feedback: string, doctorInterest?: 'High' | 'Medium' | 'Low') {
  const interest = getDoctorInterest(feedback, doctorInterest);

  if (interest === 'High') return 'Positive Feedback';
  if (interest === 'Low') return 'Low Interest';

  return 'Neutral Feedback';
}

export default function CallAnalytics({
  doctorName,
  doctorId,
  mieId,
  mode = 'single',
  callKind,
  callType = 'planned',
  durationSeconds,
  previousDurationSeconds,
  slidesViewed,
  totalSlides,
  feedback,
  doctorInterest,
  slideTimes,
  slideLabels,
  brandTimes,
  skuTimes,
  returnToNewDoctor = false,
}: CallAnalyticsProps) {
  const isCombined = mode === 'combined';

  // callKind arrives as a loose string off the route params, so it is mapped
  // rather than indexed blind: 'parking' reads as Walking, and anything
  // unrecognised is shown as it came.
  const shownKind = callKind
    ? (CALL_KIND_LABELS[callKind as CallKind] ?? callKind)
    : undefined;
  // Same query key as the section below, so React Query serves one fetch.
  const summaryQuery = useDoctorCallSummary(
    mieId,
    doctorId,
    // A combined report opened from a Call Type tab is scoped to that kind.
    isCombined ? callKind : undefined
  );
  const summary = summaryQuery.data?.summary;

  // Combined reports have no single call to describe, so the headline figures
  // come from the month's totals instead of the (absent) call params.
  const displayDuration = isCombined ? (summary?.durationSeconds ?? 0) : durationSeconds;
  const displaySlidesViewed = isCombined ? (summary?.slidesShown ?? 0) : slidesViewed;
  const displayTotalSlides = isCombined ? (summary?.slidesTotal ?? 0) : totalSlides;

  const safeSlideTimes =
    slideTimes.length > 0 ? slideTimes : Array.from({ length: totalSlides }, () => 0);

  // What this ONE call covered. Brand-wise forcing carries no SKU at all, so the
  // SKU list is genuinely empty rather than echoing the brand name.
  const callBrandTimes = brandTimes ?? [];
  const callSkuTimes = skuTimes ?? [];
  const hasSkuBreakdown = callSkuTimes.length > 0;

  // Coverage headline: how much of the month's quota this doctor has had.
  // Falls back to a plain count when their class carries no quota.
  const callsDoneLabel = summary?.maxVisits
    ? `${summary.visitsDone} of ${summary.maxVisits} calls done this month`
    : `${summary?.totalCalls ?? 0} call${summary?.totalCalls === 1 ? '' : 's'} done this month`;

  const lastVisitLabel = summary?.lastVisit
    ? (() => {
        const date = new Date(`${summary.lastVisit}T00:00:00`);
        return Number.isNaN(date.getTime())
          ? summary.lastVisit
          : date.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
      })()
    : null;

  // Duration compared to the previous call: how much longer (+) or shorter (-).
  const durationDeltaSeconds =
    previousDurationSeconds != null ? durationSeconds - previousDurationSeconds : null;
  const durationPill =
    durationDeltaSeconds == null
      ? 'First call'
      : durationDeltaSeconds === 0
        ? 'Same as last'
        : `${durationDeltaSeconds > 0 ? '+' : '-'}${formatSlideTime(Math.abs(durationDeltaSeconds))} vs last`;
  // Longer than last → green (more engagement); shorter → red.
  const durationTone: 'positive' | 'negative' =
    durationDeltaSeconds != null && durationDeltaSeconds < 0 ? 'negative' : 'positive';
  const completion =
    displayTotalSlides > 0
      ? Math.round((displaySlidesViewed / displayTotalSlides) * 100)
      : 0;
  const interest = getDoctorInterest(feedback, doctorInterest);
  const feedbackToneLabel = getFeedbackToneLabel(feedback, doctorInterest);

  // The chart is BRAND-wise. Falls back to parsing slide labels only for calls
  // recorded before the explicit brand/SKU split was passed through.
  const chartBrandTimes =
    callBrandTimes.length > 0
      ? callBrandTimes.map((item) => ({ brand: item.name, value: item.seconds }))
      : (() => {
          const map = new Map<string, { brand: string; value: number }>();
          safeSlideTimes.forEach((seconds, index) => {
            const brand = splitSlideLabel(getSlideLabel(slideLabels, index)).primary;
            const existing = map.get(brand);
            if (existing) {
              existing.value += seconds;
            } else {
              map.set(brand, { brand, value: seconds });
            }
          });
          return [...map.values()];
        })();

  const slideTimeData = chartBrandTimes.map((item, index) => ({
    id: `${index}-${item.brand}`,
    label: item.brand,
    primaryLabel: item.brand,
    secondaryLabel: '',
    value: item.value,
    valueLabel: `${item.value}s`,
  }));

  // The rows under the chart are SKU-wise.
  const skuTimeSummary = callSkuTimes.map((item, index) => ({
    id: `${index}-${item.name}`,
    primaryLabel: item.name,
    valueLabel: formatSlideTime(item.seconds),
  }));

  const handleBackPress = () => {
    if (callType === 'unplanned' && returnToNewDoctor) {
      queueReturnToNewDoctor();
      router.replace('/(tabs)/unplanned-calls');
      return;
    }

    router.replace(callType === 'unplanned' ? '/(tabs)/unplanned-calls' : '/(tabs)/planned-calls');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerTopRow}>
            <Pressable
              onPress={handleBackPress}
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.textOnDark} />
            </Pressable>
          </View>
        </SafeAreaView>

        <View style={styles.headerProfile}>
          <View style={styles.headerIconCard}>
            <Ionicons name="stats-chart-outline" size={28} color={Colors.primary} />
          </View>

          <Text style={styles.headerTitle}>Call Report</Text>

          <Text style={styles.headerDoctor} numberOfLines={2}>
            {doctorName ?? 'This doctor'}
          </Text>

          <Text style={styles.headerProgress}>{callsDoneLabel}</Text>

          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text style={styles.completedText}>
              {isCombined
                ? // Names the scope so a group-only report never reads as if it
                  // covered every call the doctor had.
                  `${summary?.totalCalls ?? 0} ${shownKind ? `${shownKind} ` : ''}Calls Finished`
                : 'Call Finished'}
            </Text>
          </View>

          {lastVisitLabel ? (
            <View style={styles.headerFacts}>
              <View style={styles.headerFact}>
                <Ionicons name="time-outline" size={13} color={Colors.textOnDark} />
                <Text style={styles.headerFactText}>Last visit: {lastVisitLabel}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Opened from the Completed list: no single call is in context, so the
            month's rolled-up record leads. */}
        {isCombined ? (
          <MonthlyCallSummary mieId={mieId} doctorId={doctorId} kind={callKind} />
        ) : null}

        <View style={styles.metricGrid}>
          {/* The comparison pill ("+/- vs last" / "First call") is hidden for
              now — restore with pill={durationPill} tone={durationTone}. */}
          <View style={styles.metricCell}>
            <AppMetricCard
              icon="time-outline"
              accent={Colors.primary}
              label={isCombined ? 'Total Duration (Month)' : 'Total Duration'}
              value={formatDuration(displayDuration)}
            />
          </View>
          <View style={styles.metricCell}>
            <AppMetricCard
              icon="document-text-outline"
              accent="#8B5CF6"
              label={isCombined ? 'Slides Viewed (Month)' : 'Slides Viewed'}
              value={`${displaySlidesViewed} / ${displayTotalSlides}`}
              pill={`${completion}% completion`}
            />
          </View>
          {/* Doctor Interest hidden (removed from the call summary)
          <AppMetricCard
            icon="ribbon-outline"
            accent="#F97316"
            label="Doctor Interest"
            value={interest}
            pill={feedbackToneLabel}
          />
          */}
        </View>

        {/* What THIS call covered — only meaningful for a single-call report. */}
        {!isCombined ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Call Details</Text>

            <View style={styles.callDetailRows}>
              <View style={styles.callDetailRow}>
                <Text style={styles.callDetailLabel}>Call type</Text>
                <View style={styles.callDetailValue}>
                  <Tag label={shownKind ?? callType} tone="neutral" />
                </View>
              </View>

              <View style={styles.callDetailRow}>
                <Text style={styles.callDetailLabel}>
                  Brands ({callBrandTimes.length})
                </Text>
                <View style={styles.callDetailValue}>
                  {callBrandTimes.length > 0 ? (
                    callBrandTimes.map((brand) => (
                      <Tag
                        key={brand.name}
                        label={brand.name}
                        icon="cube-outline"
                        tone="primary"
                      />
                    ))
                  ) : (
                    <Text style={styles.callDetailEmpty}>None recorded</Text>
                  )}
                </View>
              </View>

              {/* Only shown when the forcing was SKU-wise. */}
              {hasSkuBreakdown ? (
                <View style={styles.callDetailRow}>
                  <Text style={styles.callDetailLabel}>
                    SKUs ({callSkuTimes.length})
                  </Text>
                  <View style={styles.callDetailValue}>
                    {callSkuTimes.map((sku) => (
                      <Tag
                        key={sku.name}
                        label={sku.name}
                        icon="pricetag-outline"
                        tone="neutral"
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Per-slide timings belong to one call; across a month they'd be a
            meaningless sum, and the per-call list above already covers it. */}
        {!isCombined ? (
        <View style={styles.detailGrid}>
          <View style={[styles.card, styles.chartCard]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Time Spent per Brand (Seconds)</Text>
            </View>

            <View style={styles.chartWrapper}>
              <AppColumnChart
                data={slideTimeData.map((item) => ({
                  label: item.label,
                  value: item.value,
                  topLabel: item.valueLabel,
                }))}
                height={140}
              />
            </View>

            {/* SKU-wise rows. A brand-wise forcing deck has no SKUs, so this
                whole block is omitted rather than repeating the brands. */}
            {hasSkuBreakdown ? (
              <View style={styles.slideTimeList}>
                <Text style={styles.slideTimeHeading}>Time Spent per SKU</Text>
                {skuTimeSummary.map((item) => (
                  <View key={item.id} style={styles.slideTimeRow}>
                    <Text style={styles.slideTimeLabel}>
                      <Text style={styles.slideTimePrimaryLabel}>{item.primaryLabel}</Text>
                    </Text>
                    <Text style={styles.slideTimeValue}>{item.valueLabel}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.sideColumn}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Post Call Analysis</Text>
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackText}>&quot;{feedback}&quot;</Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.secondary,
    paddingBottom: 50,
  },
  headerTopRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  headerProfile: {
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 4,
  },
  headerIconCard: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  // Big, bold, and tinted — the one thing that names the screen.
  headerTitle: {
    color: Colors.primaryLight,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 36,
    textAlign: 'center',
  },
  headerDoctor: {
    color: Colors.textOnDark,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
  },
  headerProgress: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  headerFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  headerFact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerFactText: {
    color: Colors.textOnDark,
    fontSize: 12,
    fontWeight: '700',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 4,
  },
  completedText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scroll: {
    flex: 1,
    marginTop: -36,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
  },
  // Two across, so the pair reads as one row rather than two full-width slabs.
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  metricCell: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 160,
  },
  detailGrid: {
    gap: 16,
  },
  sideColumn: {
    gap: 16,
  },
  card: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  chartCard: {
    minHeight: 270,
  },
  callDetailRows: {
    gap: 12,
    marginTop: 12,
  },
  callDetailRow: {
    gap: 6,
  },
  callDetailLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  callDetailValue: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  callDetailEmpty: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  chartWrapper: {
    marginTop: 18,
  },
  slideTimeList: {
    marginTop: 18,
    gap: 10,
  },
  slideTimeHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  slideTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  slideTimeLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  slideTimePrimaryLabel: {
    fontWeight: '800',
  },
  slideTimeValue: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackBox: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 20,
    marginTop: 20,
  },
  feedbackText: {
    color: Colors.text,
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '500',
    lineHeight: 21,
  },
});
