import { useMemo } from "react";

import { useMonthlyCallTotals, type CallPeriod } from "@/api/calls";
import { useAuth } from "@/providers/AuthProvider";

/**
 * The three headline figures shown on Analytics.
 */
export interface SummaryMetric {
  label: string;
  value: string;
  /** The pill beside the value. Omitted when there is no real figure. */
  change?: string;
  /** Names the pill where the card's own label doesn't — e.g. "RFI". */
  pillCaption?: string;
  tone: "positive" | "negative" | "neutral";
}

/**
 * Seconds as the card shows them: under a minute stays in seconds, an exact
 * number of minutes drops the seconds, otherwise both. "14m" reads as a round
 * figure, "14m 20s" as a measured one — which is what this is.
 */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Whole percent of `part` out of `whole`; 0 when there is no whole. */
function share(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * The three headline figures on Analytics, all computed for the SELECTED
 * PERIOD. Every one comes from /calls/monthly-totals — one request, one set of
 * call_tracking rows — so the cards can never disagree with each other or with
 * the "Calls Completed" card above them.
 *
 * Deliberately independent of the doctor list. That list is paginated for
 * rendering, so reading totals from it reported whatever had been fetched so
 * far (121 of 130 doctors) and was fixed to the current month besides.
 *
 * CALLS: completed calls in the period, against the plan — the sum of each
 * doctor's class quota (an A4 doctor is 4 calls, an A2 is 2), resolved per
 * doctor↔rep from doctor_tso_class_monthly_visit.
 *
 * COVERAGE: a doctor is covered once the rep has called on them AT ALL in the
 * period — one call is enough, whatever their class. So the two figures move
 * independently: an A4 doctor called once is fully covered but a quarter
 * through their quota.
 *
 * The quota and the assigned-doctor count are monthly by nature, so they are
 * read for the month the period starts in. Narrowing to a few days asks "how
 * much of this month's plan did I cover in these days" — the days themselves
 * carry no separate target.
 */
export function useSummaryMetrics(
  period?: CallPeriod,
): readonly SummaryMetric[] {
  const { user } = useAuth();
  const { data: totals } = useMonthlyCallTotals(user?.mieId, period);

  const made = totals?.thisMonth ?? 0;
  const planned = totals?.plannedCalls ?? 0;
  const covered = totals?.thisMonthDoctorIds.length ?? 0;
  const doctors = totals?.assignedDoctors ?? 0;
  const callPercent = share(made, planned);
  const coveredPercent = share(covered, doctors);

  /**
   * Total slide time over the calls it was spent on. Uses the SAME completed
   * calls the "Calls Completed" card counts, so the two figures can never
   * disagree about how many calls the period held.
   */
  const calls = totals?.thisMonth ?? 0;
  const avgSeconds = calls > 0 ? (totals?.thisMonthSeconds ?? 0) / calls : 0;
  const prevCalls = totals?.previousMonth ?? 0;
  const prevAvgSeconds =
    prevCalls > 0 ? (totals?.previousMonthSeconds ?? 0) / prevCalls : 0;

  // Change against the same span a month back — the comparison the Calls
  // Completed card already makes. No pill when there is nothing to compare to:
  // a first month would otherwise show a meaningless +100%.
  const avgChange =
    prevAvgSeconds > 0
      ? Math.round(((avgSeconds - prevAvgSeconds) / prevAvgSeconds) * 100)
      : null;

  return useMemo(
    () => [
      {
        label: "Call / Planned",
        value: `${made} / ${planned}`,
        // Progress through the plan, not a month-over-month change. It stays
        // blue until the target is met and green after — being at 20% on the 7th
        // is normal, so painting it red would cry wolf all month. No pill at all
        // when there is no target; there'd be nothing to be a percentage of.
        change: planned > 0 ? `${callPercent}%` : undefined,
        // This percentage is the rep's RFI. Named on the pill because the card's
        // own label says "Call / Planned", which describes the fraction to its
        // left rather than the figure the business reports on.
        pillCaption: "RFI",
        tone: callPercent >= 100 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Covered / Doctors",
        value: `${covered} / ${doctors}`,
        change: doctors > 0 ? `${coveredPercent}%` : undefined,
        tone:
          coveredPercent >= 100 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Avg Engagement Time",
        // Total slide time / calls made. A period with no calls has no average
        // to state — a dash, not a zero, which would read as "no engagement".
        value: calls > 0 ? formatDuration(avgSeconds) : "—",
        change:
          avgChange === null
            ? undefined
            : `${avgChange > 0 ? "+" : ""}${avgChange}%`,
        // Longer detailing is the good direction here.
        tone:
          avgChange === null || avgChange === 0
            ? ("neutral" as const)
            : avgChange > 0
              ? ("positive" as const)
              : ("negative" as const),
      },
    ],
    [
      made,
      planned,
      callPercent,
      covered,
      doctors,
      coveredPercent,
      calls,
      avgSeconds,
      avgChange,
    ],
  );
}
