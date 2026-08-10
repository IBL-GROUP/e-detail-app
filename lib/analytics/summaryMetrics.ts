import { useMemo } from "react";

import { useInfinitePlannedDoctors } from "@/api/doctor";
import { useAuth } from "@/providers/AuthProvider";

/**
 * The four headline figures shown on Analytics.
 */
export interface SummaryMetric {
  label: string;
  value: string;
  /** The pill beside the value. Omitted when there is no real figure. */
  change?: string;
  tone: "positive" | "negative" | "neutral";
}

/**
 * PLACEHOLDER DATA — not yet computed from call_tracking. Last card in the row,
 * so the two live figures lead.
 */
const AVG_DURATION: SummaryMetric = {
  label: "Avg Engagement Time",
  value: "14m",
  change: "-2%",
  tone: "negative",
};

export interface MonthlyProgress {
  /** Calls recorded this month that count toward the plan. */
  made: number;
  /** Calls the rep's doctor classes require this month. */
  planned: number;
  /** How much of the call plan is done, 0-100. Zero when nothing is planned. */
  callPercent: number;
  /** Assigned doctors called at least once this month. */
  covered: number;
  /** Every doctor assigned to this rep. */
  doctors: number;
  /** Share of the rep's doctors covered, 0-100. */
  coveredPercent: number;
}

/** Whole percent of `part` out of `whole`; 0 when there is no whole. */
function share(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * This rep's month, in one pass over the doctor list they already have cached —
 * so it costs no extra request, works offline, and reports the same numbers the
 * Call Reporting list shows.
 *
 * CALLS: the plan is the sum of each doctor's class quota — an A4 doctor is 4
 * calls, an A2 is 2 — which the backend resolves per doctor↔rep from
 * doctor_tso_class_monthly_visit (falling back to the class master) and returns
 * as `MaxVisitCount`. `VisitCount` is the completed calls against that quota.
 * Doctors with no class carry no quota, so they count toward NEITHER side —
 * including their calls in "made" would push the figure past a plan that never
 * asked for them.
 *
 * COVERAGE: a doctor is covered once the rep has called on them AT ALL this
 * month — one call is enough, whatever their class. So an A4 doctor at 1 of 4
 * calls is fully covered but only a quarter of the way through their quota,
 * which is why the two figures move independently. Every assigned doctor counts
 * toward the total here, classified or not.
 */
export function useMonthlyProgress(): MonthlyProgress {
  const { user } = useAuth();
  const doctorsQuery = useInfinitePlannedDoctors({
    mieId: user?.mieId,
    teamId: user?.teamId,
  });

  return useMemo(() => {
    const rows = doctorsQuery.data?.pages.flatMap((page) => page.data) ?? [];

    const totals = rows.reduce(
      (running, row) => {
        const quota = row.MaxVisitCount ?? 0;
        const visits = row.VisitCount ?? 0;
        return {
          made: running.made + Math.min(visits, quota),
          planned: running.planned + quota,
          covered: running.covered + (visits > 0 ? 1 : 0),
        };
      },
      { made: 0, planned: 0, covered: 0 },
    );

    return {
      ...totals,
      doctors: rows.length,
      callPercent: share(totals.made, totals.planned),
      coveredPercent: share(totals.covered, rows.length),
    };
  }, [doctorsQuery.data?.pages]);
}

/** The headline figures, with calls and doctor coverage computed live. */
export function useSummaryMetrics(): readonly SummaryMetric[] {
  const { made, planned, callPercent, covered, doctors, coveredPercent } =
    useMonthlyProgress();

  return useMemo(
    () => [
      {
        label: "Calls Made / Planned Calls",
        value: `${made} / ${planned}`,
        // Progress through the plan, not a month-over-month change. It stays
        // blue until the target is met and green after — being at 20% on the 7th
        // is normal, so painting it red would cry wolf all month. No pill at all
        // when there is no target; there'd be nothing to be a percentage of.
        change: planned > 0 ? `${callPercent}%` : undefined,
        tone: callPercent >= 100 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Covered / Doctors",
        value: `${covered} / ${doctors}`,
        change: doctors > 0 ? `${coveredPercent}%` : undefined,
        tone:
          coveredPercent >= 100 ? ("positive" as const) : ("neutral" as const),
      },
      AVG_DURATION,
    ],
    [made, planned, callPercent, covered, doctors, coveredPercent],
  );
}
