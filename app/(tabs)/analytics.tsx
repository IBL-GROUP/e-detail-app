import { AppColumnChart, ColumnChartPoint } from '@/components/ui/AppColumnChart';
import { AppCalendarSheet } from '@/components/ui/AppCalendarSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppChartCard } from '@/components/ui/AppChartCard';
import { AppLineChart, LineChartDataPoint } from '@/components/ui/AppLineChart';
import { SummaryMetricsGrid } from '@/components/ui/SummaryMetricsGrid';
import { AppSegmentedToggle, type SegmentedOption } from '@/components/ui/AppSegmentedToggle';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { exportAnalyticsPdf, type BreakdownRow } from '@/lib/analytics/exportPdf';
import { useSummaryMetrics } from '@/lib/analytics/summaryMetrics';
import {
  SALES_BY_BRAND,
  SALES_BY_SPECIALTY,
  SALES_METRICS,
  SALES_MONTHLY,
} from '@/lib/analytics/salesDemo';
import { useEngagement, useMonthlyCallTotals, type EngagementSlice } from '@/api/calls';
import { useAuth } from '@/providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
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
  // Analytics is scoped to a date range (start → end); default to today.
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date());
  const [isExporting, setIsExporting] = useState(false);
  const [view, setView] = useState<PerformanceView>('call');
  const isSales = view === 'sales';
  // Same figures the metric grid renders, so the PDF matches the screen.
  const metrics = useSummaryMetrics();
  // Completed calls this month vs last, straight from call_tracking.
  const { data: monthlyCompleted } = useMonthlyCallTotals(user?.mieId);
  // Average detailing time per call, by specialty and by brand.
  const { data: engagement } = useEngagement(user?.mieId);
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
              metrics: SALES_METRICS,
              monthly: {
                title: 'Sales Booked',
                thisMonth: SALES_MONTHLY.thisMonth,
                previousMonth: SALES_MONTHLY.previousMonth,
              },
              breakdowns: [
                { title: 'Avg Sales by Specialty', rows: toRows(SALES_BY_SPECIALTY) },
                { title: 'Avg Sales by Brand', rows: toRows(SALES_BY_BRAND) },
              ],
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
        {/* One bordered control split down the middle — the two halves read as a
            single range, but each still opens its own calendar exactly as before. */}
        <View style={[styles.datesGroup, stackHeaderActions && styles.fullWidthField]}>
          <View style={styles.dateGroup}>
            <View
              style={[styles.dateGroupHalf, stackDateLabels && styles.dateGroupHalfStacked]}
            >
              <Text style={styles.dateGroupLabel}>Start Date :</Text>
              <AppCalendarSheet
                value={startDate}
                onChange={(next) => {
                  setStartDate(next);
                  // Keep the range valid: pull the end up if it fell behind.
                  if (next > endDate) setEndDate(next);
                }}
                title="Select Start Date"
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
              <Text style={styles.dateGroupLabel}>End Date :</Text>
              <AppCalendarSheet
                value={endDate}
                onChange={(next) => {
                  setEndDate(next);
                  // Keep the range valid: pull the start back if it overtook.
                  if (next < startDate) setStartDate(next);
                }}
                title="Select End Date"
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
              {isSales ? 'Sales Booked' : 'Calls Completed'}
            </Text>
            <Text style={styles.rfiSubtitle}>(This / Previous Month)</Text>
          </View>
        </View>
        <View style={styles.rfiStatsRow}>
          <View style={styles.rfiStatBox}>
            <Text style={styles.rfiStatLabel}>This Month</Text>
            <Text style={styles.rfiStatValue}>
              {isSales ? SALES_MONTHLY.thisMonth : monthlyCompleted?.thisMonth ?? 0}
            </Text>
          </View>
          <View style={styles.rfiStatBox}>
            <Text style={styles.rfiStatLabel}>Previous Month</Text>
            <Text style={styles.rfiStatValue}>
              {isSales
                ? SALES_MONTHLY.previousMonth
                : monthlyCompleted?.previousMonth ?? 0}
            </Text>
          </View>
        </View>
      </View>

      <SummaryMetricsGrid metrics={isSales ? SALES_METRICS : metrics} />

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

        <AppChartCard
          title={
            isSales
              ? 'Average Sales by Specialty'
              : 'Average Engagement Time by Specialty'
          }
          icon={<Ionicons name="people-outline" size={20} color={Colors.primary} />}
          chartWrapperStyle={styles.barChartWrapper}
          style={styles.chartCard}
        >
          {isSales ? (
            <AppColumnChart data={SALES_BY_SPECIALTY} height={210} />
          ) : specialtyColumns.length > 0 ? (
            <AppColumnChart data={specialtyColumns} height={210} />
          ) : (
            <Text style={styles.chartEmpty}>
              No calls recorded this month yet.
            </Text>
          )}
        </AppChartCard>

        <AppChartCard
          title={
            isSales ? 'Average Sales by Brand' : 'Average Engagement Time by Brand'
          }
          icon={<Ionicons name="cube-outline" size={20} color={Colors.primary} />}
          chartWrapperStyle={styles.barChartWrapper}
          style={styles.chartCard}
        >
          {isSales ? (
            <AppColumnChart data={SALES_BY_BRAND} height={210} />
          ) : brandColumns.length > 0 ? (
            <AppColumnChart data={brandColumns} height={210} />
          ) : (
            <Text style={styles.chartEmpty}>
              No brands detailed this month yet.
            </Text>
          )}
        </AppChartCard>
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
    gap: 12,
  },
  rfiStatBox: {
    flex: 1,
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
});
