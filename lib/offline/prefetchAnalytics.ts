import {
  engagementKey,
  getEngagement,
  getMonthlyCallTotals,
  getSlideEngagement,
  monthlyCallTotalsKey,
  slideEngagementKey,
  type CallPeriod,
} from '@/api/calls';
import { getMieSales, mieSalesKey } from '@/api/sales';
import { queryClient } from '@/providers/QueryProvider';

/** YYYY-MM-DD in the phone's local time — the same as the Analytics screen's toIsoDay. */
function isoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Fetches this month's Analytics (1st to today — the screen's default period)
 * into the cache after a sync, so the screen has figures to show offline even
 * if the rep never opened it while connected. Same keys and same requests as
 * the screen's own hooks, so the screen reads exactly these entries.
 *
 * Fire-and-forget, after the sync has already finished: sales can take a while
 * on the warehouse side, and nothing waits for it. A failure just leaves the
 * screen to fetch for itself next time it is opened online.
 */
export function prefetchAnalytics(mieId: string): void {
  const today = new Date();
  const period: CallPeriod = {
    from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDay(today),
  };

  const jobs = [
    queryClient.prefetchQuery({
      queryKey: monthlyCallTotalsKey(mieId, period),
      queryFn: () => getMonthlyCallTotals(mieId, period),
    }),
    queryClient.prefetchQuery({
      queryKey: engagementKey(mieId, period),
      queryFn: () => getEngagement(mieId, period),
    }),
    queryClient.prefetchQuery({
      queryKey: slideEngagementKey(mieId, period),
      queryFn: () => getSlideEngagement(mieId, period),
    }),
    queryClient.prefetchQuery({
      queryKey: mieSalesKey(mieId, period),
      queryFn: () => getMieSales(mieId, period),
    }),
  ];
  void Promise.allSettled(jobs);
}
