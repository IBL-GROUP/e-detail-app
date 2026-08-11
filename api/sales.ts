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
 * Held for longer than the call figures: this reads a foreign table on the data
 * warehouse, which is billed daily at best and costs seconds per query, so
 * refetching it as often as call data would be waste for numbers that cannot
 * have changed. Persisted with the rest of the query cache, so the last figures
 * are still readable offline.
 */
export const useMieSales = (mieId?: string, period?: CallPeriod) =>
  useQuery({
    queryKey: mieSalesKey(mieId, period),
    queryFn: () => getMieSales(mieId as string, period as CallPeriod),
    enabled: Boolean(mieId && period),
    staleTime: 30 * 60 * 1000,
  });

/**
 * Money as the screen writes it: 1.24M, 386K, 940. Sales run to eight figures,
 * which will not fit in a stat box unabbreviated.
 */
export function formatAmount(value: number): string {
  const amount = Number(value) || 0;
  const sign = amount < 0 ? '-' : '';
  const size = Math.abs(amount);

  if (size >= 1_000_000) return `${sign}${(size / 1_000_000).toFixed(2)}M`;
  if (size >= 1_000) return `${sign}${Math.round(size / 1_000)}K`;
  return `${sign}${Math.round(size)}`;
}
