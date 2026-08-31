import { useDoctorCallSummary } from '@/api/calls';
import { Tag } from '@/components/tag';
import { AppColumnChart } from '@/components/ui/AppColumnChart';
import { AppMetricCard } from '@/components/ui/AppMetricCard';
import { Colors } from '@/constants/theme';
import { queueReturnToNewDoctor } from '@/views/unplanned-calls/returnToNewDoctorStore';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  /**
   * Every doctor in the room, for a group call, each with the date the rep last
   * called on them (null if never). The header line above collapses to
   * "Group Call · 3 doctors", which says how many but not who — these name them
   * and carry their own history.
   *
   * Resolved by the CALL SCREEN, not here: a group call is opened with the
   * placeholder id 'institution-group', so this screen's own summary query has
   * no real doctor to ask about. Empty for a single-doctor call, where the name
   * is already the header and `summary` answers for the history.
   */
  doctorAttendees?: { name: string; lastVisit: string | null }[];
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
  /**
   * Who sat in on the call, as the summary recorded it — 'No', or a comma
   * separated list of manager roles ('RM, SM').
   */
  jointCall?: string;
  /** The SKU handed over, or 'None'. */
  samplesProvided?: string;
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

/**
 * A stored YYYY-MM-DD as the header writes it. Parsed at local midnight rather
 * than through `new Date(iso)`, which reads a bare date as UTC and can land on
 * the previous day for anyone west of it.
 *
 * Anything unparseable is handed back untouched — better a raw value than a
 * confidently wrong date.
 */
function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatVisitDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return formatDateLabel(date);
}

/**
 * The date to put against one attendee of the group call just finished.
 *
 * `lastVisit` is what the doctor book held BEFORE this call was recorded, so a
 * doctor the rep had seen before shows that earlier date. A doctor they had
 * never called has none — and the answer there is today, because the call just
 * made is now their most recent one. Every pill carries a real date either way;
 * "First call" left the rep looking at a report of a call they had just made
 * and being told none existed.
 */
function attendeeVisitLabel(lastVisit: string | null) {
  return lastVisit ? formatVisitDate(lastVisit) : formatDateLabel(new Date());
}

/**
 * A comma-joined summary field as a list of tags, minus its "nothing" sentinel.
 *
 * The call summary submits these as plain strings — 'No' / 'RM, SM' for the
 * joint call, 'None' / a SKU name for samples — so the sentinel has to be
 * recognised by value. Compared case-insensitively because it is user-facing
 * copy, not an enum.
 */
function splitRecorded(value: string | undefined, sentinel: string) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && item.toLowerCase() !== sentinel);
}

/**
 * The width at which Call Details' two columns stop wrapping and sit abreast —
 * both columns at their minimum plus the gap between them. Kept next to the
 * styles it mirrors (callDetailColumn.minWidth, callDetailColumns.columnGap);
 * change one and this has to move with it.
 */
const DETAIL_COLUMN_MIN_WIDTH = 240;
const DETAIL_COLUMN_GAP = 24;
const DETAIL_TWO_COLUMN_WIDTH =
  DETAIL_COLUMN_MIN_WIDTH * 2 + DETAIL_COLUMN_GAP;

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
  doctorAttendees = [],
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
  jointCall,
  samplesProvided,
  slideTimes,
  slideLabels,
  brandTimes,
  skuTimes,
  returnToNewDoctor = false,
}: CallAnalyticsProps) {
  const isCombined = mode === 'combined';

  /**
   * Both arrive as the comma-joined strings the summary submitted, with a
   * sentinel for "nothing" — 'No' for the joint call, 'None' for samples. The
   * sentinels are dropped here so the card can show its own empty state rather
   * than a tag reading "No", which looks like a manager called No.
   */
  const jointCallRoles = splitRecorded(jointCall, 'no');
  const sampleNames = splitRecorded(samplesProvided, 'none');

  /**
   * Whether Call Details' two columns are actually sitting side by side.
   *
   * Measured rather than derived from the window: the rule that decides it is
   * flexbox wrapping inside the card, and reproducing that from screen width
   * would mean hard-coding every padding between here and the edge. Wrong by a
   * few points and the divider draws down the left of a stacked column.
   */
  const [detailColumnsWidth, setDetailColumnsWidth] = useState(0);
  const showDetailDivider = detailColumnsWidth >= DETAIL_TWO_COLUMN_WIDTH;
  const handleDetailColumnsLayout = (event: LayoutChangeEvent) => {
    setDetailColumnsWidth(event.nativeEvent.layout.width);
  };

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

  const lastVisitLabel = summary?.lastVisit
    ? formatVisitDate(summary.lastVisit)
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

          {/* Who was actually in the room, and when the rep last saw each of
              them. Only a group call carries these — a single-doctor call has
              the name in the line above and the date in the row below. */}
          {doctorAttendees.length > 0 ? (
            <View style={styles.headerDoctorPills}>
              {doctorAttendees.map((attendee) => (
                <View key={attendee.name} style={styles.headerDoctorPill}>
                  <Ionicons
                    name="person-outline"
                    size={12}
                    color={Colors.textOnDark}
                  />
                  <Text style={styles.headerDoctorPillText} numberOfLines={1}>
                    {attendee.name}
                  </Text>
                  {/* Splits the pill into who and when, so a long name doesn't
                      run straight into a date and read as one string. */}
                  <View style={styles.headerDoctorPillRule} />
                  <Ionicons
                    name="time-outline"
                    size={11}
                    color="rgba(255,255,255,0.68)"
                  />
                  <Text style={styles.headerDoctorPillMeta} numberOfLines={1}>
                    {attendeeVisitLabel(attendee.lastVisit)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text style={styles.completedText}>
              {isCombined
                ? // Names the scope so a group-only report never reads as if it
                  // covered every call the doctor had.
                  `${summary?.totalCalls ?? 0} ${shownKind ? `${shownKind} ` : ''}Calls Completed`
                : 'Call Completed'}
            </Text>
          </View>

          {/* The single-doctor case only, and only when there IS a date.
              A group call carries a date per attendee in the pills above, where
              one shared row could not say whose history it meant. */}
          {lastVisitLabel && doctorAttendees.length === 0 ? (
            <View style={styles.headerFacts}>
              <View style={styles.headerFact}>
                <Ionicons name="time-outline" size={13} color={Colors.textOnDark} />
                <Text style={styles.headerFactText}>
                  Last call: {lastVisitLabel}
                </Text>
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

        {/* What THIS call covered — only meaningful for a single-call report.
            One card, two columns: what was DETAILED on the left, how the call
            was CONDUCTED on the right. The columns wrap to a stack below their
            minimum width, so a phone reads it as one list. */}
        {!isCombined ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Call Details</Text>

            <View
              style={styles.callDetailColumns}
              onLayout={handleDetailColumnsLayout}
            >
              {/* Left: what was detailed. */}
              <View style={styles.callDetailColumn}>
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

              {/* Only while the columns are actually abreast — once they wrap
                  to a stack this would draw down the left of the lower one. */}
              {showDetailDivider ? (
                <View style={styles.callDetailDivider} />
              ) : null}

              {/* Right: how the call was conducted. */}
              <View style={styles.callDetailColumn}>
                <View style={styles.callDetailRow}>
                  <Text style={styles.callDetailLabel}>Joint call</Text>
                  <View style={styles.callDetailValue}>
                    {jointCallRoles.length > 0 ? (
                      jointCallRoles.map((role) => (
                        <Tag
                          key={role}
                          label={role}
                          icon="people-outline"
                          tone="primary"
                        />
                      ))
                    ) : (
                      // Said plainly rather than as a tag: "no manager joined"
                      // is the normal case, and a chip for it would read as a
                      // fact recorded about the call rather than the absence
                      // of one.
                      <Text style={styles.callDetailEmpty}>
                        Not a joint call
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.callDetailRow}>
                  <Text style={styles.callDetailLabel}>
                    Samples provided ({sampleNames.length})
                  </Text>
                  <View style={styles.callDetailValue}>
                    {sampleNames.length > 0 ? (
                      sampleNames.map((name) => (
                        <Tag
                          key={name}
                          label={name}
                          icon="cube-outline"
                          tone="neutral"
                        />
                      ))
                    ) : (
                      <Text style={styles.callDetailEmpty}>None provided</Text>
                    )}
                  </View>
                </View>
              </View>
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
  // The group's doctors, under the "Group Call · N doctors" line. Centred and
  // wrapping, so three names read as one block rather than a ragged list.
  headerDoctorPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  headerDoctorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // Same translucent-white treatment as the facts row below, so the header
    // reads as one surface rather than three unrelated chip styles.
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    // A long doctor name shrinks rather than pushing the row off the header.
    maxWidth: '100%',
    flexShrink: 1,
  },
  headerDoctorPillText: {
    flexShrink: 1,
    color: Colors.textOnDark,
    fontSize: 12,
    fontWeight: '700',
  },
  // Full-width rather than a hairline: at 0.5pt this all but disappears against
  // the header's navy. Inset vertically so it reads as a divider inside the
  // pill rather than a line cutting the pill in two.
  headerDoctorPillRule: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 3,
    marginHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  // The date rides in the same pill, dimmed — it qualifies the name rather than
  // competing with it, and a separate chip per date would double the row.
  headerDoctorPillMeta: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 11,
    fontWeight: '600',
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
  // Call Details' two columns. Explicit columns rather than one wrapping list of
  // fields: the left column is what was detailed and the right is how the call
  // was conducted, and a wrapping list would reshuffle that pairing whenever a
  // field appeared or dropped out (SKUs only show for a SKU-wise deck).
  callDetailColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: DETAIL_COLUMN_GAP,
    rowGap: 12,
    marginTop: 12,
  },
  callDetailColumn: {
    // flexBasis 0 rather than a percentage: with the divider between them the
    // two columns share whatever is left over evenly, so the rule lands in the
    // middle of the card instead of drifting with the content.
    flexGrow: 1,
    flexBasis: 0,
    // Below this they wrap and stack, which is what a phone gets.
    minWidth: DETAIL_COLUMN_MIN_WIDTH,
    gap: 12,
  },
  // A hairline between the columns, stretched to whichever is taller.
  callDetailDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: Colors.border,
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
