import type { ColumnChartPoint } from '@/components/ui/AppColumnChart';
import type { SummaryMetric } from '@/lib/analytics/summaryMetrics';

/**
 * DEMO DATA for the Sales Performance view.
 *
 * There is NO sales source wired up yet — every figure here is invented so the
 * view can be reviewed as a layout. The screen says so on its face (see the
 * notice banner on Analytics); nothing here is ever shown without it.
 *
 * Delete this module the moment real sales data lands. Only app/(tabs)/analytics
 * imports it, so nothing else has to change.
 */

/** Completed sales this month vs last, mirroring the Calls Completed card. */
export const SALES_MONTHLY = {
  thisMonth: '1.24M',
  previousMonth: '1.11M',
  /** Growth between the two, pre-computed — the figures above are display strings. */
  growth: '+11.7%',
};

/** The headline row for Sales: the target, progress against it, and the projection. */
export const SALES_METRICS: readonly SummaryMetric[] = [
  // What the month is being measured against — no pill, nothing to compare it to.
  { label: 'Monthly Target', value: '1.80M', tone: 'neutral' },
  // How far through that target the month is; the pill carries the raw figure.
  {
    label: 'Achievement %',
    value: '69%',
    change: '1.24M',
    tone: 'neutral',
  },
  // Where the month lands if it carries on at the current rate; the pill is
  // that projection as a share of the target.
  {
    label: 'Expected Sales for the Month',
    value: '1.71M',
    change: '95% of target',
    tone: 'positive',
  },
];

// Values are thousands. The currency is not repeated on every bar — the whole
// view is in PKR and the labels only have to separate one bar from the next.
export const SALES_BY_BRAND: ColumnChartPoint[] = [
  { label: 'EXTOR', value: 386, topLabel: '386K' },
  { label: 'RANCARD XR', value: 297, topLabel: '297K' },
  { label: 'EMSYN MET', value: 244, topLabel: '244K' },
  { label: 'XAVI', value: 168, topLabel: '168K' },
  { label: 'EMSYN LEE', value: 145, topLabel: '145K' },
];

export const SALES_BY_SKU: ColumnChartPoint[] = [
  { label: 'EXTOR 5/80 MG', value: 212, topLabel: '212K' },
  { label: 'RANCARD XR 1000MG', value: 174, topLabel: '174K' },
  { label: 'EMSYN MET 5 + 1000 MG', value: 151, topLabel: '151K' },
  { label: 'EXTOR 10/160 MG', value: 128, topLabel: '128K' },
  { label: 'XAVI 10MG', value: 96, topLabel: '96K' },
];

/** Brick = the territory unit a rep's sales are booked against. */
export const SALES_BY_BRICK: ColumnChartPoint[] = [
  { label: 'Karachi South', value: 341, topLabel: '341K' },
  { label: 'Karachi East', value: 288, topLabel: '288K' },
  { label: 'Clifton', value: 219, topLabel: '219K' },
  { label: 'Gulshan', value: 176, topLabel: '176K' },
  { label: 'Malir', value: 132, topLabel: '132K' },
];
