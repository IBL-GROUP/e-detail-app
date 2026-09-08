import { useQuery } from '@tanstack/react-query';
import axios from '@/config/axios';
import type { CallPeriod } from '@/api/calls';

/**
 * MIE brick-wise sales for the Analytics screen's Sales Performance view.
 *
 * Sourced from the DW's invoice data (`mv_tscl_data`) scoped to the rep's own
 * bricks. There is NO target anywhere in that source, so nothing here reports a
 * target, an achievement percentage, or progress against one — the screen shows
 * what was actually sold, and no more.
 */

/** One bar of a sales breakdown. */
export interface SalesSlice {
  name: string;
  amount: number;
  soldQty: number;
}

export interface SalesBrickSlice extends SalesSlice {
  brickId: string;
}

export interface SalesSkuSlice extends SalesSlice {
  itemCode: string;
}

export interface SalesCustomerSlice extends SalesSlice {
  customerId: string;
}

/**
 * The sales query joins the DW's invoice table, which postgres_fdw cannot filter
 * remotely — a cold request takes ~70s. The shared axios instance times out at
 * 30s, which would abort it every time, so this one call gets its own budget.
 * The backend caches each period for 30 minutes, so only the first request after
 * a period changes actually waits.
 */
const SALES_REQUEST_TIMEOUT_MS = 180_000;

export interface MieSalesSummary {
  /** Sales value in the selected period, and in the same span a month earlier. */
  currentAmount: number;
  previousAmount: number;
  /** Percent change between the two; null when there is nothing to grow from. */
  growthPct: number | null;
  /** Units sold in the selected period. */
  currentQty: number;
  /**
   * The rep's standing MONTHLY target, summed over their assigned products.
   * `mie_product_target` has no period column, so this is the same figure
   * whatever span is selected — a part-month is measured against the full
   * month's number, which is what an achievement percentage means.
   */
  targetValue: number;
  targetUnit: number;
  /** Sales as a percentage of target; null when the rep carries no target. */
  achievementPct: number | null;
  byBrick: SalesBrickSlice[];
  bySku: SalesSkuSlice[];
  byCustomer: SalesCustomerSlice[];
  /**
   * Empty unless the backend query selects `d.brands` — it currently returns
   * item_description but no brand, so the Brand card hides itself rather than
   * claiming there were no sales.
   */
  byBrand: SalesSlice[];
  /** The span the comparison figure covers, for labelling. */
  previousFrom?: string | null;
  previousTo?: string | null;
}

export const mieSalesKey = (mieId?: string, period?: CallPeriod) =>
  [
    'mie-sales',
    mieId ?? 'no-mie',
    period ? `${period.from}..${period.to}` : 'no-period',
  ] as const;

export const getMieSales = async (
  mieId: string,
  period: CallPeriod,
): Promise<MieSalesSummary> => {
  const res = (await axios.get('/mie_sales/summary', {
    params: { mieId, from: period.from, to: period.to },
    timeout: SALES_REQUEST_TIMEOUT_MS,
  })) as unknown as { success: boolean } & Partial<MieSalesSummary>;

  return {
    currentAmount: res.currentAmount ?? 0,
    previousAmount: res.previousAmount ?? 0,
    growthPct: res.growthPct ?? null,
    currentQty: res.currentQty ?? 0,
    targetValue: res.targetValue ?? 0,
    targetUnit: res.targetUnit ?? 0,
    achievementPct: res.achievementPct ?? null,
    byBrick: res.byBrick ?? [],
    bySku: res.bySku ?? [],
    byCustomer: res.byCustomer ?? [],
    byBrand: res.byBrand ?? [],
    previousFrom: res.previousFrom ?? null,
    previousTo: res.previousTo ?? null,
  };
};

/**
 * The rep's sales for a period.
 *
 * Deliberately NOT held stale on the client. It used to sit on a 30-minute
 * staleTime, which — combined with the cache being persisted to disk — meant a
 * reload restored the old response and never asked the server again. Corrected
 * figures could not be seen at all except in a fresh (incognito) profile.
 *
 * The server keeps its own short cache, so asking on every mount is cheap: a
 * repeat request comes back in milliseconds rather than re-running the ~100s
 * warehouse query. The last response is still persisted, so the figures remain
 * readable offline — they are just never treated as fresh enough to skip a
 * refetch when the screen is opened.
 */
export const useMieSales = (mieId?: string, period?: CallPeriod) =>
  useQuery({
    queryKey: mieSalesKey(mieId, period),
    queryFn: () => getMieSales(mieId as string, period as CallPeriod),
    enabled: Boolean(mieId && period),
    staleTime: 0,
    refetchOnMount: 'always',
  });

/**
 * Money as the screen writes it: 6,082K, 386K, 940.
 *
 * THOUSANDS ONLY — millions are deliberately not used. A month that reads
 * "6.08M" beside a target of "4.71M" makes two figures a rep is meant to
 * compare differ in the third significant digit, and the eye has to unpack the
 * decimal to see the gap. In thousands they line up as 6,082K against 4,710K
 * and the difference is readable at a glance.
 *
 * Grouped with a comma so the larger figures stay legible once they run past
 * four digits of thousands.
 */
export function formatAmount(value: number): string {
  const amount = Number(value) || 0;
  const sign = amount < 0 ? '-' : '';
  const size = Math.abs(amount);

  if (size >= 1_000) {
    return `${sign}${Math.round(size / 1_000).toLocaleString('en-US')}K`;
  }
  return `${sign}${Math.round(size)}`;
}
