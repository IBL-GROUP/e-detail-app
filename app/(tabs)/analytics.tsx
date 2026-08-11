import { AppColumnChart, ColumnChartPoint } from '@/components/ui/AppColumnChart';
import { AppMonthSheet, AppDayRangeSheet, daysInMonth } from '@/components/ui/AppPeriodSheets';
import { AppButton } from '@/components/ui/AppButton';
import { AppChartCard } from '@/components/ui/AppChartCard';
import { AppLineChart, LineChartDataPoint } from '@/components/ui/AppLineChart';
import { SummaryMetricsGrid } from '@/components/ui/SummaryMetricsGrid';
import {
  AppSkeleton,
  AppSkeletonChart,
  AppSkeletonStat,
} from '@/components/ui/AppSkeleton';
import { AppSegmentedToggle, type SegmentedOption } from '@/components/ui/AppSegmentedToggle';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { exportAnalyticsPdf, type BreakdownRow } from '@/lib/analytics/exportPdf';
import { useSummaryMetrics } from '@/lib/analytics/summaryMetrics';
import { useMieSales, formatAmount, type SalesSlice } from '@/api/sales';
import {
  useEngagement,
  useMonthlyCallTotals,
  type CallPeriod,
  type EngagementSlice,
} from '@/api/calls';
import type { SummaryMetric } from '@/lib/analytics/summaryMetrics';
import { useAuth } from '@/providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const callVolumeData: LineChartDataPoint[] = [
  { label: 'Jan', value: 45 },
  { label: 'Feb', value: 52 },
  { label: 'Mar', value: 60 },
  { label: 'Apr', value: 48 },
  { label: 'May', value: 70 },
  { label: 'Jun', value: 66 },
];

/** Seconds as the app writes them everywhere else: "2m 30s", "45s". */
function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/** An engagement breakdown as the column chart wants it — time above each bar. */
function toColumns(slices: EngagementSlice[]): ColumnChartPoint[] {
  return slices.map((slice) => ({
    label: slice.name,
    value: slice.seconds,
    topLabel: formatDuration(slice.seconds),
  }));
}

/** The same columns as PDF rows — one shape drives the chart and the export. */
function toRows(points: ColumnChartPoint[]): BreakdownRow[] {
  return points.map((point) => ({
    name: point.label,
    value: point.value,
    display: point.topLabel ?? String(point.value),
  }));
}

const rfiData = {
  planned: 320,
  completed: 284,
};

// RFI (Plan / Completed) card is hidden for now — flip to true to bring it back.
const SHOW_RFI = false;

// Call Volume vs Goal is hidden for now — it still plots the placeholder series
// above, not real calls. Flip to true to bring it back.
const SHOW_CALL_VOLUME = false;

/**
 * Which half of the rep's performance the screen is reporting on. Sales has no
 * data source yet — its cards render the same shapes with dashes, so the layout
 * is settled for whenever the numbers arrive.
 */
type PerformanceView = 'call' | 'sales';

const PERFORMANCE_VIEWS: SegmentedOption<PerformanceView>[] = [
  { key: 'call', label: 'Call Performance', icon: 'call-outline' },
  { key: 'sales', label: 'Sales Performance', icon: 'cash-outline' },
];

/**
 * Most bars a sales breakdown shows. A rep's brick list runs to 24 and their SKU
 * list further; past this the chart is unreadable and the tail is rounding.
 */
const SALES_BREAKDOWN_LIMIT = 8;

/** A sales breakdown as the column chart wants it — the amount above each bar. */
function toSalesColumns(slices: SalesSlice[]): ColumnChartPoint[] {
  return slices
    .filter((slice) => Number(slice.amount) > 0)
    .slice(0, SALES_BREAKDOWN_LIMIT)
    .map((slice) => ({
      label: slice.name,
      value: Number(slice.amount) || 0,
      topLabel: formatAmount(Number(slice.amount) || 0),
    }));
}

/** YYYY-MM-DD in LOCAL time — toISOString would shift the day across UTC. */
function toIsoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A span as a short label: "Aug 1 – 10", "Jul 22 – Aug 3", or "Aug 5" for a
 * single day. The month is only repeated when the span crosses one, so the
 * common case stays short enough for a stat box.
 */
function formatSpan(from?: string | null, to?: string | null) {
  if (!from || !to) return '';

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';

  const month = (date: Date) =>
    date.toLocaleDateString(undefined, { month: 'short' });

  if (from === to) return `${month(start)} ${start.getDate()}`;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${month(start)} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
}

function formatRangeLabel(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  const startText = start.toLocaleDateString(undefined, opts);
  const endText = end.toLocaleDateString(undefined, opts);
  return startText === endText ? startText : `${startText} – ${endText}`;
}

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  /**
   * Below this the label and the date stop fitting on one line inside a
   * half-width control, and the date wrapped down the middle of the box
   * ("Aug / 10, / 2026"). Putting the label on its own line hands the date the
   * full width of its half instead.
   */
  const stackDateLabels = width < 900;
  /**
   * Smaller still: even stacked, each date only gets a quarter of the screen
   * because Export PDF holds the other half of the row. Below this the button
   * drops onto its own line so the two dates share the FULL width instead.
   */
  const stackHeaderActions = width < 640;
  /**
   * The period is a month plus a day range inside it. Defaults to the current
   * month, 1st through today — the figures a rep wants on opening the screen.
   */
  const [period, setPeriod] = useState(() => {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth(),
      fromDay: 1,
      toDay: today.getDate(),
    };
  });

  // The same period as real dates, for the PDF header and any range-aware query.
  const startDate = useMemo(
    () => new Date(period.year, period.month, period.fromDay),
    [period],
  );
  const endDate = useMemo(
    () => new Date(period.year, period.month, period.toDay),
    [period],
  );
  const [isExporting, setIsExporting] = useState(false);
  const [view, setView] = useState<PerformanceView>('call');
  const isSales = view === 'sales';
  /**
   * The selected period as the API wants it. Memoised on the primitives rather
   * than on `period`, so a re-render with the same days doesn't produce a new
   * object and refetch every query keyed on it.
   */
  const callPeriod = useMemo<CallPeriod>(
    () => ({ from: toIsoDay(startDate), to: toIsoDay(endDate) }),
    [startDate, endDate],
  );
  // Same figures the metric grid renders, so the PDF matches the screen.
  const metrics = useSummaryMetrics(callPeriod);
  // Calls completed in the period, against the same length of time before it.
  const { data: monthlyCompleted } = useMonthlyCallTotals(user?.mieId, callPeriod);
  // Average detailing time per call in the period, by specialty and by brand.
  const { data: engagement } = useEngagement(user?.mieId, callPeriod);
  /**
   * Brick-wise sales for the same period. Only fetched for the Sales view — it
   * queries the data warehouse and takes seconds, so a rep who never opens the
   * tab never pays for it.
   */
  const salesQuery = useMieSales(user?.mieId, isSales ? callPeriod : undefined);
  const sales = salesQuery.data;
  /**
   * True while the period's sales are still being fetched and nothing is cached
   * for it yet. A cold request runs the better part of a minute, so every figure
   * on this view is a skeleton until it lands — showing 0 in the meantime would
   * be indistinguishable from a period that genuinely had no sales.
   */
  const isSalesLoading = isSales && salesQuery.isPending;

  /**
   * The three breakdown cards, in the order the Sales view shows them.
   *
   * Brand is always rendered even though the sales query carries no brand column
   * yet — it shows its empty state rather than disappearing, so the layout stays
   * put and the gap is visible. It fills in on its own if `d.brands` is added to
   * the query server-side.
   */
  const salesBreakdowns = useMemo(
    () => [
      {
        title: 'Sales by Brand',
        icon: 'cube-outline' as const,
        data: toSalesColumns(sales?.byBrand ?? []),
      },
      {
        title: 'Sales by SKU',
        icon: 'pricetag-outline' as const,
        data: toSalesColumns(sales?.bySku ?? []),
      },
      {
        title: 'Sales by Brick',
        icon: 'map-outline' as const,
        data: toSalesColumns(sales?.byBrick ?? []),
      },
    ],
    [sales],
  );

  /**
   * The Sales headline row. There is no target in the source data, so this
   * reports what the period actually did — units, the territory it came from,
   * and where the month lands at the current rate — rather than progress toward
   * a number nobody supplies.
   */
  const salesMetrics = useMemo<SummaryMetric[]>(() => {
    const amount = sales?.currentAmount ?? 0;
    // Days covered so far vs the whole month, so the projection scales the
    // period's run rate rather than assuming the month is complete.
    const daysCovered = Math.max(1, period.toDay - period.fromDay + 1);
    const monthLength = daysInMonth(period.year, period.month);
    const projected = (amount / daysCovered) * monthLength;
    const brickCount = (sales?.byBrick ?? []).filter((b) => b.amount > 0).length;

    return [
      { label: 'Units Sold', value: (sales?.currentQty ?? 0).toLocaleString(), tone: 'neutral' },
      { label: 'Bricks with Sales', value: String(brickCount), tone: 'neutral' },
      {
        label: 'Expected Sales for the Month',
        value: formatAmount(projected),
        change: `${daysCovered} of ${monthLength} days`,
        tone: 'neutral',
      },
    ];
  }, [sales, period]);
  /**
   * Prefer the spans the server reported the figures for; before the first
   * response lands, fall back to the period the pickers are showing. The span
   * is named in brackets so the label says both what it is and what it covers.
   */
  const currentSpan =
    formatSpan(monthlyCompleted?.currentFrom, monthlyCompleted?.currentTo) ||
    formatSpan(callPeriod.from, callPeriod.to);
  const previousSpan = formatSpan(
    monthlyCompleted?.previousFrom,
    monthlyCompleted?.previousTo,
  );
  const currentSpanLabel = currentSpan
    ? `Current Month (${currentSpan})`
    : 'Current Month';
  const previousSpanLabel = previousSpan
    ? `Previous Month (${previousSpan})`
    : 'Previous Month';
  const specialtyColumns = toColumns(engagement?.bySpecialty ?? []);
  const brandColumns = toColumns(engagement?.byBrand ?? []);
  const outstandingCalls = Math.max(0, rfiData.planned - rfiData.completed);
  const rfiCompletion = rfiData.planned > 0
    ? Math.round((rfiData.completed / rfiData.planned) * 100)
    : 0;

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // Export whichever view is on screen, so the document matches what the
      // rep was looking at when they tapped it.
      await exportAnalyticsPdf(
        isSales
          ? {
              dateLabel: formatRangeLabel(startDate, endDate),
              viewLabel: 'Sales Performance',
              metrics: salesMetrics,
              monthly: {
                title: 'Total Sales',
                thisMonth: formatAmount(sales?.currentAmount ?? 0),
                previousMonth: formatAmount(sales?.previousAmount ?? 0),
              },
              // The same three cards the Sales view shows, in the same order.
              breakdowns: salesBreakdowns.map((breakdown) => ({
                title: breakdown.title,
                rows: toRows(breakdown.data),
              })),
            }
          : {
              dateLabel: formatRangeLabel(startDate, endDate),
              viewLabel: 'Call Performance',
              metrics,
              monthly: {
                title: 'Calls Completed',
                thisMonth: String(monthlyCompleted?.thisMonth ?? 0),
                previousMonth: String(monthlyCompleted?.previousMonth ?? 0),
              },
              breakdowns: [
                {
                  title: 'Avg Engagement Time by Specialty',
                  rows: toRows(specialtyColumns),
                },
                {
                  title: 'Avg Engagement Time by Brand',
                  rows: toRows(brandColumns),
                },
              ],
            },
      );
    } catch (error) {
      console.log('[analytics] PDF export failed', error);
      Alert.alert('Export failed', 'Could not generate the PDF report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScreenLayout
      title="Analytics & Reports"
      subtitle="Deep dive into your field performance metrics"
      contentStyle={styles.content}
    >
      <View
        style={[styles.headerActions, stackHeaderActions && styles.headerActionsStacked]}
      >
        {/* One bordered control split down the middle: WHICH month on the left,
            WHICH days inside it on the right. */}
        <View style={[styles.datesGroup, stackHeaderActions && styles.fullWidthField]}>
          <View style={styles.dateGroup}>
            <View
              style={[styles.dateGroupHalf, stackDateLabels && styles.dateGroupHalfStacked]}
            >
              <Text style={styles.dateGroupLabel}>Month :</Text>
              <AppMonthSheet
                year={period.year}
                month={period.month}
                onChange={(year, month) =>
                  setPeriod(() => {
                    // A new month resets the days: the old range may not exist in
                    // it (the 31st of a 30-day month), and "so far" only means
                    // today in the current month.
                    const today = new Date();
                    const isCurrentMonth =
                      year === today.getFullYear() && month === today.getMonth();
                    return {
                      year,
                      month,
                      fromDay: 1,
                      toDay: isCurrentMonth
                        ? today.getDate()
                        : daysInMonth(year, month),
                    };
                  })
                }
                chevronColor={Colors.primary}
                triggerStyle={[
                  styles.dateTrigger,
                  stackDateLabels && styles.dateTriggerStacked,
                ]}
                triggerContentStyle={styles.dateTriggerContent}
                triggerTextStyle={styles.dateTriggerText}
              />
            </View>

            <View style={styles.dateGroupDivider} />

            <View
              style={[styles.dateGroupHalf, stackDateLabels && styles.dateGroupHalfStacked]}
            >
              <Text style={styles.dateGroupLabel}>Days :</Text>
              <AppDayRangeSheet
                year={period.year}
                month={period.month}
                fromDay={period.fromDay}
                toDay={period.toDay}
                onChange={(fromDay, toDay) =>
                  setPeriod((current) => ({ ...current, fromDay, toDay }))
                }
                chevronColor={Colors.primary}
                triggerStyle={[
                  styles.dateTrigger,
                  stackDateLabels && styles.dateTriggerStacked,
                ]}
                triggerContentStyle={styles.dateTriggerContent}
                triggerTextStyle={styles.dateTriggerText}
              />
            </View>
          </View>
        </View>
        <View
          style={[styles.exportFieldWrap, stackHeaderActions && styles.fullWidthField]}
        >
          <AppButton
            label={isExporting ? 'Preparing…' : 'Export PDF'}
            onPress={handleExportPdf}
            style={styles.exportButton}
            textStyle={styles.exportButtonText}
            icon={<Ionicons name="download-outline" size={20} color={Colors.textOnDark} />}
          />
        </View>
      </View>

      <AppSegmentedToggle
        options={PERFORMANCE_VIEWS}
        value={view}
        onChange={setView}
      />

      <View style={styles.rfiCard}>
        <View style={styles.rfiHeader}>
          <View style={styles.rfiTitleRow}>
            <Ionicons
              name={isSales ? 'cash-outline' : 'checkmark-done-outline'}
              size={20}
              color={Colors.primary}
            />
            <Text style={styles.sectionTitle}>
              {isSales ? 'Total Sales' : 'Calls Completed'}
            </Text>
            {/* Both views compare the same way, so they read the same way. */}
            <Text style={styles.rfiSubtitle}>
              Selected month vs previous month
            </Text>
          </View>
        </View>
        <View style={styles.rfiStatsRow}>
          <View style={styles.rfiStatBox}>
            {/* Labelled with the span the figure actually covers — the period is
                a day range, so "This Month" was only ever right by accident. */}
            <Text style={styles.rfiStatLabel}>{currentSpanLabel}</Text>
            {isSalesLoading ? (
              <AppSkeleton width={104} height={26} />
            ) : (
              <Text style={styles.rfiStatValue}>
                {isSales
                  ? formatAmount(sales?.currentAmount ?? 0)
                  : monthlyCompleted?.thisMonth ?? 0}
              </Text>
            )}
          </View>

          <View style={styles.rfiStatBox}>
            <Text style={styles.rfiStatLabel}>{previousSpanLabel}</Text>
            {isSalesLoading ? (
              <AppSkeleton width={104} height={26} />
            ) : (
              <Text style={styles.rfiStatValue}>
                {isSales
                  ? formatAmount(sales?.previousAmount ?? 0)
                  : monthlyCompleted?.previousMonth ?? 0}
              </Text>
            )}
          </View>

          {/* Sales only: how the two compare, so the reader doesn't have to do
              the arithmetic between the boxes either side of it. A dash when the
              previous period sold nothing — there is no growth from zero. */}
          {isSales ? (
            <View style={styles.rfiStatBox}>
              <Text style={styles.rfiStatLabel}>Growth</Text>
              {isSalesLoading ? (
                <AppSkeleton width={72} height={26} />
              ) : (
                <Text style={styles.rfiStatValue}>
                  {sales?.growthPct == null
                    ? '—'
                    : `${sales.growthPct > 0 ? '+' : ''}${sales.growthPct}%`}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </View>

      {isSalesLoading ? (
        // Same 3-up shape the real cards take, so nothing jumps when they land.
        <View style={styles.metricSkeletonRow}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={styles.metricSkeletonCell}>
              <AppSkeletonStat labelWidth={index === 2 ? 110 : 70} />
            </View>
          ))}
        </View>
      ) : (
        <SummaryMetricsGrid metrics={isSales ? salesMetrics : metrics} />
      )}

      {SHOW_RFI && (
      <View style={styles.rfiCard}>
        <View style={styles.rfiHeader}>
          <View style={styles.rfiTitleRow}>
            <Ionicons name="swap-horizontal-outline" size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>RFI</Text>
            <Text style={styles.rfiSubtitle}>(Plan / Completed)</Text>
          </View>
        </View>
        <View style={styles.rfiStatsRow}>
          <View style={styles.rfiStatBox}>
            <Text style={styles.rfiStatLabel}>Planned</Text>
            <Text style={styles.rfiStatValue}>{rfiData.planned}</Text>
          </View>
          <View style={styles.rfiStatBox}>
            <Text style={styles.rfiStatLabel}>Completed</Text>
            <Text style={styles.rfiStatValue}>{rfiData.completed}</Text>
          </View>
        </View>

        <View style={styles.rfiProgressBlock}>
          <View style={styles.rfiProgressHeader}>
            <Text style={styles.rfiProgressLabel}>Completion Progress</Text>
            <Text style={styles.rfiProgressValue}>{rfiCompletion}%</Text>
          </View>
          <View style={styles.rfiTrack}>
            <View style={[styles.rfiFill, { width: `${rfiCompletion}%` }]} />
          </View>
        </View>

        <View style={styles.rfiFooterRow}>
          <View style={styles.rfiFooterPill}>
            <Text style={styles.rfiFooterPillText}>{outstandingCalls} Remaining</Text>
          </View>
          <Text style={styles.rfiFooterText}>
            {rfiData.completed} of {rfiData.planned} planned calls completed
          </Text>
        </View>
      </View>
      )}

      <View style={styles.chartsGrid}>
        {SHOW_CALL_VOLUME && (
          <AppChartCard
            title="Call Volume vs Goal"
            icon={<Ionicons name="trending-up-outline" size={20} color={Colors.primary} />}
            chartWrapperStyle={styles.lineChartWrapper}
            style={styles.chartCard}
          >
            <AppLineChart data={callVolumeData} goal={50} maxValue={80} height={230} />
          </AppChartCard>
        )}

        {isSales ? (
          // Sales breaks down three ways; calls break down two. Rendering them
          // as separate sets beats forcing one set of cards to be both.
          salesBreakdowns.map((breakdown) => (
            <AppChartCard
              key={breakdown.title}
              title={breakdown.title}
              icon={
                <Ionicons name={breakdown.icon} size={20} color={Colors.primary} />
              }
              chartWrapperStyle={styles.barChartWrapper}
              style={styles.chartCard}
            >
              {isSalesLoading ? (
                <AppSkeletonChart bars={5} height={210} />
              ) : breakdown.data.length > 0 ? (
                <AppColumnChart data={breakdown.data} height={210} />
              ) : (
                <Text style={styles.chartEmpty}>
                  No sales recorded in this period.
                </Text>
              )}
            </AppChartCard>
          ))
        ) : (
          <>
            <AppChartCard
              title="Average Engagement Time by Specialty"
              icon={
                <Ionicons name="people-outline" size={20} color={Colors.primary} />
              }
              chartWrapperStyle={styles.barChartWrapper}
              style={styles.chartCard}
            >
              {specialtyColumns.length > 0 ? (
                <AppColumnChart data={specialtyColumns} height={210} />
              ) : (
                <Text style={styles.chartEmpty}>
                  No calls recorded in this period.
                </Text>
              )}
            </AppChartCard>

            <AppChartCard
              title="Average Engagement Time by Brand"
              icon={<Ionicons name="cube-outline" size={20} color={Colors.primary} />}
              chartWrapperStyle={styles.barChartWrapper}
              style={styles.chartCard}
            >
              {brandColumns.length > 0 ? (
                <AppColumnChart data={brandColumns} height={210} />
              ) : (
                <Text style={styles.chartEmpty}>
                  No brands detailed in this period.
                </Text>
              )}
            </AppChartCard>
          </>
        )}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    paddingBottom: 36,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  // Very small screens: dates on one line, export button beneath.
  headerActionsStacked: {
    flexDirection: 'column',
  },
  // Overrides the 50/50 split so each control spans the row on its own.
  fullWidthField: {
    flex: 0,
    flexBasis: 'auto',
    width: '100%',
  },
  // Left 50%: the joined start/end control.
  datesGroup: {
    flex: 1,
    flexBasis: 0,
  },
  // Right 50%: the export button, matched to the group's height.
  // No justifyContent here: centring the button held it at its own height while
  // the taller date control set the row's. The button stretches instead.
  exportFieldWrap: {
    flex: 1,
    flexBasis: 0,
  },
  // The two pickers share one outline, split by a hairline. Fills its wrapper so
  // it ends up exactly as tall as the export button beside it — without flex it
  // sat at its content height while the button set the row's.
  dateGroup: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  // Label and date sit on one line: "START DATE : Aug 7, 2026".
  dateGroupHalf: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  // Narrow screens: label on its own line, date beneath it at full width.
  dateGroupHalfStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    // Column direction makes the vertical axis the main one, so this is what
    // keeps the label + date centred if the group stretches to match the button.
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 7,
  },
  dateGroupDivider: {
    width: 2,
    backgroundColor: Colors.primary,
  },
  dateGroupLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // The trigger drops its own chrome — the group owns the border now. It takes
  // the leftover width so a long date shrinks rather than pushing the label out.
  dateTrigger: {
    flex: 1,
    minWidth: 0,
    minHeight: 22,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  // Stacked, the trigger is no longer competing with the label for one row —
  // it takes the half's full width instead of the leftover space.
  dateTriggerStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  dateTriggerContent: {
    justifyContent: 'flex-start',
    gap: 6,
  },
  dateTriggerText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  exportButton: {
    // Same rule as the date control: a 40px floor, growing to whichever of the
    // two is taller so both always end up the same height.
    flex: 1,
    width: '100%',
    minHeight: 40,
    borderRadius: 12,
    paddingVertical: 5,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  chartsGrid: {
    gap: 16,
  },
  rfiCard: {
    borderRadius: 18,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rfiHeader: {
    gap: 6,
  },
  chartCard: {
    minHeight: 330,
  },
  rfiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  rfiSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  rfiStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  rfiStatBox: {
    flex: 1,
    // Three boxes need a floor, or the labels crush on a narrow screen; with
    // flexWrap the third drops to its own line instead.
    minWidth: 150,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },
  rfiStatLabel: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rfiStatValue: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  rfiProgressBlock: {
    gap: 8,
  },
  rfiProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rfiProgressLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  rfiProgressValue: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  rfiTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  rfiFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  rfiFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rfiFooterPill: {
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rfiFooterPillText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  rfiFooterText: {
    flex: 1,
    textAlign: 'right',
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  lineChartWrapper: {
    marginTop: 20,
  },
  barChartWrapper: {
    marginTop: 32,
  },
  chartEmpty: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  // Mirrors SummaryMetricsGrid's layout so the skeletons occupy the same space
  // the real metric cards will, and nothing shifts when they resolve.
  metricSkeletonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricSkeletonCell: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 150,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
  },
});
