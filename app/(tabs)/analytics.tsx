import {
  useEngagement,
  useMonthlyCallTotals,
  type CallPeriod,
  type EngagementSlice,
} from '@/api/calls';
import { useInfinitePlannedDoctors } from '@/api/doctor';
import {
  formatAmount,
  useMieSales,
  type MieSalesSummary,
  type SalesSlice,
} from '@/api/sales';
import { AppButton } from '@/components/ui/AppButton';
import { AppChartCard } from '@/components/ui/AppChartCard';
import { AppColumnChart, ColumnChartPoint } from '@/components/ui/AppColumnChart';
import { AppLineChart, LineChartDataPoint } from '@/components/ui/AppLineChart';
import { AppDayRangeSheet, AppMonthSheet, daysInMonth } from '@/components/ui/AppPeriodSheets';
import { AppSegmentedToggle, type SegmentedOption } from '@/components/ui/AppSegmentedToggle';
import {
  AppSkeleton,
  AppSkeletonChart,
  AppSkeletonStat,
} from '@/components/ui/AppSkeleton';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { SummaryMetricsGrid } from '@/components/ui/SummaryMetricsGrid';
import { Colors } from '@/constants/theme';
import { exportAnalyticsPdf, type BreakdownRow } from '@/lib/analytics/exportPdf';
import type { SummaryMetric } from '@/lib/analytics/summaryMetrics';
import { useSummaryMetrics } from '@/lib/analytics/summaryMetrics';
import { useAuth } from '@/providers/AuthProvider';
import { mapDoctorRows } from '@/views/planned-calls/mapDoctor';
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
 * Which figure the sales breakdowns are plotted in.
 *
 * Every slice the backend returns carries BOTH: `amount` (rupees) and `soldQty`
 * (packs). They answer different questions — a high-value brand can be a small
 * number of units, and a rep chasing volume targets needs the second one — so
 * the charts switch between them rather than picking one.
 */
type SalesMeasure = 'value' | 'units';

const SALES_MEASURES: SegmentedOption<SalesMeasure>[] = [
  { key: 'value', label: 'Value' },
  { key: 'units', label: 'Units' },
];

/**
 * The three sales breakdown cards, in the order the view shows them.
 *
 * Declared out here rather than inline so the per-card measure state can be
 * keyed off the same list — one place decides which cards exist, and adding a
 * fourth gives it its own toggle for free.
 *
 * Brand is always rendered even though the sales query may carry no brand rows
 * — it shows its empty state rather than disappearing, so the layout stays put
 * and the gap is visible.
 */
const SALES_BREAKDOWNS = [
  {
    key: 'brand',
    title: 'Sales by Brand',
    icon: 'cube-outline',
    slicesOf: (sales?: MieSalesSummary) => sales?.byBrand ?? [],
  },
  {
    key: 'sku',
    title: 'Sales by SKU',
    icon: 'pricetag-outline',
    slicesOf: (sales?: MieSalesSummary) => sales?.bySku ?? [],
  },
  {
    key: 'brick',
    title: 'Sales by Brick',
    icon: 'map-outline',
    slicesOf: (sales?: MieSalesSummary) => sales?.byBrick ?? [],
  },
] as const satisfies readonly {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  slicesOf: (sales?: MieSalesSummary) => SalesSlice[];
}[];

type SalesBreakdownKey = (typeof SALES_BREAKDOWNS)[number]['key'];
type SalesMeasureState = Record<SalesBreakdownKey, SalesMeasure>;

/**
 * Units as the bars write them. Unlike money these stay readable unabbreviated
 * well into five figures, so a real count is shown for as long as it fits and
 * only then abbreviated.
 *
 * Rounded because the figure is share-weighted (a brick worked by three MIEs
 * gives this rep a fraction of its packs) — "2,412.33 packs" is precision the
 * underlying split doesn't actually have.
 */
function formatUnits(value: number): string {
  const units = Math.round(Number(value) || 0);
  const sign = units < 0 ? '-' : '';
  const size = Math.abs(units);

  if (size >= 1_000_000) return `${sign}${(size / 1_000_000).toFixed(2)}M`;
  if (size >= 100_000) return `${sign}${Math.round(size / 1_000)}K`;
  return `${sign}${size.toLocaleString('en-US')}`;
}

/** The selected measure's figure and how it is written. */
function measureOf(slice: SalesSlice, measure: SalesMeasure) {
  return measure === 'units'
    ? Number(slice.soldQty) || 0
    : Number(slice.amount) || 0;
}

function formatMeasure(value: number, measure: SalesMeasure) {
  return measure === 'units' ? formatUnits(value) : formatAmount(value);
}

/**
 * A sales breakdown as the column chart wants it — the selected figure above
 * each bar.
 *
 * EVERY category is returned, not a top-N slice: a rep with 29 bricks selling
 * needs to see all 29, and truncating silently made the chart disagree with the
 * totals above it. AppColumnChart stops squeezing past its minimum slot width
 * and scrolls horizontally instead, so a long tail stays readable.
 *
 * Categories with no sales are dropped — they would be zero-height bars taking
 * up width, and nothing is lost by omitting them.
 *
 * Re-sorted on the selected measure. The backend ranks every breakdown by value,
 * which is the wrong order for a units chart: the biggest earner is not always
 * the biggest seller, and bars that don't descend read as a broken chart.
 */
function toSalesColumns(
  slices: SalesSlice[],
  measure: SalesMeasure,
): ColumnChartPoint[] {
  return slices
    .map((slice) => ({ slice, figure: measureOf(slice, measure) }))
    .filter((entry) => entry.figure > 0)
    .sort((left, right) => right.figure - left.figure)
    .map(({ slice, figure }) => ({
      label: slice.name,
      value: figure,
      topLabel: formatMeasure(figure, measure),
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
   * Value or units, held PER CHART — brand, SKU and brick each keep their own.
   * A rep reading SKUs in packs while judging brands on money is a normal thing
   * to want, so the three cards don't move together.
   */
  const [salesMeasures, setSalesMeasures] = useState<SalesMeasureState>(() =>
    Object.fromEntries(
      SALES_BREAKDOWNS.map((breakdown) => [breakdown.key, 'value']),
    ) as SalesMeasureState,
  );
  const setSalesMeasure = (key: SalesBreakdownKey) => (next: SalesMeasure) =>
    setSalesMeasures((current) => ({ ...current, [key]: next }));
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
  const monthlyTotalsQuery = useMonthlyCallTotals(user?.mieId, callPeriod);
  const monthlyCompleted = monthlyTotalsQuery.data;

  /**
   * REACH — the share of DOCTORS whose month is finished.
   *
   * Counted per doctor against their own class quota: an A4 counts once all
   * four of their calls are made, an A2 once both are. Three of four is not
   * reached, and neither is one of two.
   *
   * Not to be confused with RFI, which is now the Call / Planned pill — calls
   * made against calls owed. The two move independently: eight calls on one
   * doctor lifts RFI and reaches nobody new.
   *
   * Read from the cached doctor book rather than the totals endpoint: that is
   * where the per-doctor quota lives, its visitCount already folds in calls
   * still sitting in this device's outbox, and it works offline. It is also
   * exactly what the Doctor List counts in its own subtitle, so the two agree.
   */
  const doctorsQuery = useInfinitePlannedDoctors({
    mieId: user?.mieId,
    teamId: user?.teamId,
  });

  const { reachDone, reachTotal, reachPercent } = useMemo(() => {
    const doctors = mapDoctorRows(
      doctorsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    );
    // A doctor with no class carries no quota, so there is nothing for them to
    // complete — they are left out of both halves rather than counted as done.
    const withQuota = doctors.filter((doctor) => (doctor.maxVisits ?? 0) > 0);
    const done = withQuota.filter(
      (doctor) => (doctor.visitCount ?? 0) >= (doctor.maxVisits ?? 0),
    ).length;
    return {
      reachDone: done,
      reachTotal: withQuota.length,
      reachPercent: withQuota.length
        ? Math.round((done / withQuota.length) * 100)
        : null,
    };
  }, [doctorsQuery.data]);
  // Average detailing time per call in the period, by specialty and by brand.
  const engagementQuery = useEngagement(user?.mieId, callPeriod);
  const engagement = engagementQuery.data;
  /**
   * Brick-wise sales for the same period, fetched as soon as the screen opens
   * rather than when the Sales tab is first tapped.
   *
   * It queries the data warehouse and a cold request runs the better part of a
   * minute. Held until the tab was opened, the rep paid that whole wait staring
   * at skeletons; started now, it runs while they read their calls and is
   * usually there before they switch.
   *
   * It also makes the PDF honest: the export carries both reports, and a rep
   * who never opened the tab would otherwise have downloaded a Sales page of
   * zeroes.
   *
   * The cost is that a rep who only ever looks at calls still triggers the
   * query once per visit.
   */
  const salesQuery = useMieSales(user?.mieId, callPeriod);
  const sales = salesQuery.data;
  /**
   * True while the period's sales are still being fetched and nothing is cached
   * for it yet. A cold request runs the better part of a minute, so every figure
   * on this view is a skeleton until it lands — showing 0 in the meantime would
   * be indistinguishable from a period that genuinely had no sales.
   */
  const isSalesLoading = isSales && salesQuery.isPending;

  /**
   * The same treatment for the call figures.
   *
   * Changing the month or the day range makes a NEW query key, so every call
   * figure is refetched from scratch. Until it lands the hooks hold no data and
   * the cards fell back to their zeroes — "0 / 360", "No calls recorded in this
   * period" — which is the answer for an empty period, not a loading one. A rep
   * narrowing to 1–2 had no way to tell "still fetching" from "nothing here".
   *
   * Gated on `mieId` because a disabled query reports `pending` forever in React
   * Query v5; without it a signed-in-but-unresolved rep would sit on skeletons
   * that never resolve. `isPending` (not `isFetching`) so a period already in
   * cache keeps showing its figures while it refreshes in the background —
   * blanking settled numbers on every revisit would be its own kind of lie.
   */
  const hasMie = Boolean(user?.mieId);
  // Feeds the Calls Completed boxes AND the metric grid: both read
  // /calls/monthly-totals, so they arrive together and should wait together.
  const isCallTotalsLoading =
    !isSales && hasMie && monthlyTotalsQuery.isPending;
  // The two breakdown charts come from their own request, so they get their own
  // flag rather than being held back by (or holding back) the totals.
  const isEngagementLoading =
    !isSales && hasMie && engagementQuery.isPending;

  /**
   * SALES_BREAKDOWNS resolved against the response, each card plotted in ITS OWN
   * selected measure.
   */
  const salesBreakdowns = useMemo(
    () =>
      SALES_BREAKDOWNS.map((breakdown) => {
        const measure = salesMeasures[breakdown.key];
        return {
          ...breakdown,
          measure,
          data: toSalesColumns(breakdown.slicesOf(sales), measure),
          // Named where there is no toggle to read the measure off — the PDF.
          exportTitle: `${breakdown.title}${measure === 'units' ? ' (Units)' : ''}`,
        };
      }),
    [sales, salesMeasures],
  );

  /**
   * The rep's biggest customers this period. The endpoint already returns them
   * ranked by value across every customer they sold to (four figures of them),
   * so this is just the head of that list.
   *
   * Value only — no units switch here. The bar charts are read for mix ("which
   * brand moves"), where packs and rupees each answer something; a customer
   * ranking is read for who matters, and that is the money.
   */
  const topCustomers = useMemo(
    () => (sales?.byCustomer ?? []).filter((c) => c.amount > 0).slice(0, 10),
    [sales],
  );

  /**
   * The Sales headline row: the month's target, how far through it the period
   * is, where the month lands at this rate, and what made it up.
   */
  const salesMetrics = useMemo<SummaryMetric[]>(() => {
    const amount = sales?.currentAmount ?? 0;
    // Days covered so far vs the whole month, so the projection scales the
    // period's run rate rather than assuming the month is complete.
    const daysCovered = Math.max(1, period.toDay - period.fromDay + 1);
    const monthLength = daysInMonth(period.year, period.month);
    const projected = (amount / daysCovered) * monthLength;
    const target = sales?.targetValue ?? 0;
    const achievement = sales?.achievementPct;

    return [
      // The month's whole target — nothing to compare it against, so no pill.
      {
        label: 'Monthly Target',
        value: target > 0 ? formatAmount(target) : '—',
        tone: 'neutral',
      },
      {
        label: 'Achievement %',
        value: achievement == null ? '—' : `${achievement}%`,
        // No pill: the sales figure it came from is already the headline of the
        // Total Sales card above, so repeating it here only added noise.
        // Ahead of the month's pace reads as good; behind it does not. Compared
        // against elapsed days, not 100%, so day 12 of 31 isn't called a miss.
        tone:
          achievement == null
            ? 'neutral'
            : achievement >= (daysCovered / monthLength) * 100
              ? 'positive'
              : 'negative',
      },
      {
        label: 'Expected Sales for the Month',
        value: formatAmount(projected),
        // Where the projection lands against the target. With no target loaded
        // for the month there is nothing to be a percentage OF, so it falls back
        // to how far through the month the run rate is measured over.
        change:
          target > 0
            ? `${Math.round((projected / target) * 100)}% of target`
            : `${Math.round((daysCovered / monthLength) * 100)}% of month`,
        tone: target > 0 && projected >= target ? 'positive' : 'neutral',
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
    ? `Current Month`
    : 'Current Month';
  const previousSpanLabel = previousSpan
    ? `Previous Month`
    : 'Previous Month';
  const specialtyColumns = toColumns(engagement?.bySpecialty ?? []);
  const brandColumns = toColumns(engagement?.byBrand ?? []);

  /**
   * Reach as one more headline card on the CALL view: the share of doctors whose
   * month is finished, reading the same hooks the cards beside it do so it can
   * never disagree with them.
   *
   * The Sales view carries no equivalent. Its version was the achievement
   * percentage — the number already shown, unchanged, in the "Achievement %"
   * card two slots to its left. Two cards for one figure under different names
   * only invited the reader to look for a difference between them.
   */
  const callMetrics = useMemo<SummaryMetric[]>(() => {
    const reach: SummaryMetric = {
      label: 'Reach (Doctors Completed)',
      value: reachTotal === 0 ? '—' : `${reachDone} / ${reachTotal}`,
      change: reachPercent == null ? undefined : `${reachPercent}%`,
      tone: 'neutral',
    };
    // Reach sits in the 3rd slot, so the two rate cards (Reach, Avg Engagement)
    // line up after the two count cards (Call/Planned, Covered/Doctors).
    return [...metrics.slice(0, 2), reach, ...metrics.slice(2)];
  }, [metrics, reachDone, reachTotal, reachPercent]);

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      /**
       * BOTH reports, always — not whichever tab happens to be open.
       *
       * A rep sending their month in should send the whole of it, and a
       * document titled "Analytics & Reports" that silently held only half
       * depending on where they last tapped was a trap: nothing in the file
       * said the other half was missing.
       *
       * Calls lead, matching the order of the toggle on screen.
       */
      await exportAnalyticsPdf({
        dateLabel: formatRangeLabel(startDate, endDate),
        sections: [
          {
            viewLabel: 'Call Performance',
            metrics: callMetrics,
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
            emptyText: 'No calls recorded this month.',
          },
          {
            viewLabel: 'Sales Performance',
            metrics: salesMetrics,
            monthly: {
              title: 'Total Sales',
              thisMonth: formatAmount(sales?.currentAmount ?? 0),
              previousMonth: formatAmount(sales?.previousAmount ?? 0),
            },
            // Every card the Sales view shows, in the same order — the three
            // breakdowns and then Top 10 Customers, which is a chart on screen
            // but was left out of the export entirely.
            //
            // Exported in whichever measure the charts are currently showing, so
            // the file matches the screen it was taken from. The title says which
            // — on paper there is no toggle to read it off, and a column of pack
            // counts under a bare "Sales by Brand" would be taken for rupees.
            breakdowns: [
              ...salesBreakdowns.map((breakdown) => ({
                title: breakdown.exportTitle,
                rows: toRows(breakdown.data),
              })),
              {
                title: 'Top 10 Customers',
                rows: topCustomers.map((customer) => ({
                  // SAP code alongside the name, as on screen — the export is
                  // what gets matched back against the ERP, so the key that
                  // makes that possible has to travel with it.
                  name: customer.customerId
                    ? `${customer.name} (${customer.customerId})`
                    : customer.name,
                  value: customer.amount,
                  display: formatAmount(customer.amount),
                })),
              },
            ],
            emptyText: 'No sales recorded this month.',
          },
        ],
      });
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
            {/* <Text style={styles.rfiSubtitle}>
              Selected month vs previous month
            </Text> */}
          </View>
        </View>
        <View style={styles.rfiStatsRow}>
          <View style={styles.rfiStatBox}>
            {/* Labelled with the span the figure actually covers — the period is
                a day range, so "This Month" was only ever right by accident. */}
            <Text style={styles.rfiStatLabel}>{currentSpanLabel}</Text>
            {isSalesLoading || isCallTotalsLoading ? (
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
            {isSalesLoading || isCallTotalsLoading ? (
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
              <Text style={styles.rfiStatLabel}>GOLM</Text>
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

      {isSalesLoading || isCallTotalsLoading ? (
        // Same shape the real cards take, so nothing jumps when they land — and
        // the same COUNT: Sales shows three cards where Call shows four.
        <View style={styles.metricSkeletonRow}>
          {(isSales ? [0, 1, 2] : [0, 1, 2, 3]).map((index) => (
            <View key={index} style={styles.metricSkeletonCell}>
              <AppSkeletonStat labelWidth={index === 2 ? 110 : 70} />
            </View>
          ))}
        </View>
      ) : (
        <SummaryMetricsGrid metrics={isSales ? salesMetrics : callMetrics} />
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
          <>
            {salesBreakdowns.map((breakdown) => (
              <AppChartCard
                key={breakdown.title}
                title={breakdown.title}
                icon={
                  <Ionicons name={breakdown.icon} size={20} color={Colors.primary} />
                }
                headerAction={
                  <AppSegmentedToggle
                    options={SALES_MEASURES}
                    value={breakdown.measure}
                    onChange={setSalesMeasure(breakdown.key)}
                    variant="box"
                  />
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
            ))}

            {/* A ranked list rather than a chart: a rep's customer count runs to
                four figures, so bars would be meaningless — the useful question
                is who the biggest few are, by name. */}
            <AppChartCard
              title="Top 10 Customers"
              icon={
                <Ionicons name="storefront-outline" size={20} color={Colors.primary} />
              }
              style={styles.chartCard}
            >
              {isSalesLoading ? (
                <View style={styles.customerList}>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <View key={index} style={styles.customerRow}>
                      <AppSkeleton width={24} height={24} radius={12} />
                      {/* Name plus its SAP pill, laid out as the real row is. */}
                      <View style={styles.customerNameCell}>
                        <AppSkeleton height={13} />
                        <AppSkeleton width={54} height={16} radius={999} />
                      </View>
                      <AppSkeleton width={62} height={13} />
                    </View>
                  ))}
                </View>
              ) : topCustomers.length > 0 ? (
                <View style={styles.customerList}>
                  {topCustomers.map((customer, index) => (
                    <View key={customer.customerId} style={styles.customerRow}>
                      <View style={styles.customerRank}>
                        <Text style={styles.customerRankText}>{index + 1}</Text>
                      </View>
                      <View style={styles.customerNameCell}>
                        <Text style={styles.customerName} numberOfLines={1}>
                          {customer.name}
                        </Text>
                        {/* The customer's SAP code (brick_mapping.ibl_cust_id —
                            the customer_number the invoice feed is keyed on),
                            in a pill beside the name. The pill never shrinks and
                            the name gives up the width instead, so the code
                            stays whole on the rows whose names truncate. */}
                        {customer.customerId ? (
                          <View style={styles.customerCodePill}>
                            <Text style={styles.customerCodeText} numberOfLines={1}>
                              {customer.customerId}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.customerAmount}>
                        {formatAmount(customer.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.chartEmpty}>
                  No customers sold to in this period.
                </Text>
              )}
            </AppChartCard>
          </>
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
              {isEngagementLoading ? (
                <AppSkeletonChart bars={5} height={210} />
              ) : specialtyColumns.length > 0 ? (
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
              {isEngagementLoading ? (
                <AppSkeletonChart bars={5} height={210} />
              ) : brandColumns.length > 0 ? (
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
  customerList: {
    gap: 8,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  customerRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerRankText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  // Takes the slack so a long shop name truncates instead of shoving the
  // amount off the row.
  // Holds the name and its SAP pill side by side.
  customerNameCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerName: {
    // The only thing on the row that gives up width: the rank badge, the SAP
    // pill and the amount are all fixed, so a long shop name truncates rather
    // than pushing any of them off.
    flexShrink: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  // A lookup key for matching back against SAP, not something the list is
  // scanned by — so it's a quiet tinted pill rather than a second heading.
  customerCodePill: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
  },
  customerCodeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  customerAmount: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
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
