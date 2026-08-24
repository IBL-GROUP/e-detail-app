import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import axios from '@/config/axios';
import { useLocalCalls } from '@/lib/offline/useLocalCalls';
import {
  mergeCompletedDoctorIds,
  mergeDoctorSummary,
  mergeEngagement,
  mergeCallNotes,
  mergeMonthlyTotals,
} from '@/lib/offline/localCallModels';

/**
 * One completed call, shaped to the backend `call_tracking` columns. Only
 * `tsoid` + `doctorid` are required; everything else is optional and omitted
 * when unknown. jsonb columns accept arrays/objects (serialized server-side).
 */
export interface CallTrackingInput {
  // Client-generated id linking this call's 'started' insert to its 'completed'
  // update (the backend upserts on it). Generated at call start.
  client_call_id: string;
  tsoid: string;
  // Optional: a walking-call 'started' row has no doctor yet (chosen at End).
  doctorid?: string;
  doctor_name?: string;
  doctor_specialty?: string;
  pmdc?: string;
  doctor_last_visit?: string; // YYYY-MM-DD
  latitude?: number;
  longitude?: number;
  arrived_location?: string;
  arrived_time?: string; // ISO timestamp
  arrived_within_vicinity?: boolean; // rep within 50m of the clinic (day or evening)
  arrived_distance_meters?: number; // nearest distance from arrival GPS to the clinic
  call_start_time?: string; // ISO timestamp
  call_end_time?: string; // ISO timestamp
  total_call_time_seconds?: number;
  total_slides_count?: number;
  shown_slides_count?: number;
  slides_total_time_seconds?: number;
  each_slide_time?: unknown; // jsonb — e.g. { [slideLabel]: seconds } or number[]
  brand?: unknown; // jsonb — brands shown, e.g. [{ id, name }]
  sku?: unknown; // jsonb — SKUs shown, each linked, e.g. [{ brand_id, name }]
  brand_slide_time?: unknown; // jsonb
  sku_slide_time?: unknown; // jsonb
  join_call?: unknown; // jsonb — e.g. string[]
  sample_provided?: boolean;
  samples_json?: unknown; // jsonb
  feedback?: string;
  feedback_comment?: string;
  call_type?: string; // 'planned' | 'unplanned'
  institution_call_type?: string; // 'walking' | 'group'
  call_outcome?: string;
  /** Why the rep cancelled — set when call_outcome is 'cancelled'. */
  cancel_reason?: string;
  /** When the rep cancelled — ISO timestamp, set alongside cancel_reason. */
  call_cancel_time?: string;
  route_json?: unknown; // jsonb
  engagement_score?: number;
  conversion_score?: number;
  recording_url?: string;
  recording_duration_seconds?: number;
  prescriptions_json?: unknown; // jsonb
  current_medicines_json?: unknown; // jsonb
  created_by?: number; // user_validation.user_id
}

export interface BatchCallItem extends CallTrackingInput {
  /** Outbox client id echoed back so we know which queued row synced. */
  clientId: string;
}

export interface BatchCallResult {
  clientId: string | null;
  success: boolean;
  callId?: number;
  message?: string;
}

export interface BatchCallResponse {
  success: boolean;
  count: number;
  results: BatchCallResult[];
}

/** Record a single call immediately (used when online at submit time). */
export const postCall = async (
  payload: CallTrackingInput,
): Promise<{ success: boolean; callId: number }> => {
  return axios.post('/calls', payload) as unknown as Promise<{
    success: boolean;
    callId: number;
  }>;
};

/** Flush a batch of queued calls; returns per-item results (partial success ok). */
export const postCallsBatch = async (
  calls: BatchCallItem[],
): Promise<BatchCallResponse> => {
  return axios.post('/calls/batch', { calls }) as unknown as Promise<BatchCallResponse>;
};

/** Doctor ids this rep has RECORDED a call for today (from call_tracking). */
export const completedDoctorIdsKey = (mieId?: string) =>
  ['completed-doctors', mieId ?? 'no-mie'] as const;

export const getCompletedDoctorIds = async (mieId: string): Promise<string[]> => {
  const res = (await axios.get('/calls/completed', {
    params: { mieId },
  })) as unknown as { success: boolean; doctorIds: string[] };
  return res.doctorIds ?? [];
};

// Server-recorded completed doctors, cached (and offline-persisted) so the
// Completed tab survives app restarts. Refetches when online.
export const useCompletedDoctorIds = (mieId?: string) => {
  const query = useQuery({
    queryKey: completedDoctorIdsKey(mieId),
    queryFn: () => getCompletedDoctorIds(mieId as string),
    enabled: Boolean(mieId),
    staleTime: 60 * 1000,
  });
  const local = useLocalCalls();

  const data = useMemo(
    () => mergeCompletedDoctorIds(query.data, local, mieId, query.dataUpdatedAt),
    [query.data, query.dataUpdatedAt, local, mieId],
  );

  return { ...query, data };
};

export interface MonthlyCallTotals {
  thisMonth: number;
  previousMonth: number;
  /**
   * Total slide time across those calls. Kept as a total rather than an average
   * so calls still sitting in the outbox can be added to both halves before it
   * is divided.
   */
  thisMonthSeconds: number;
  previousMonthSeconds: number;
  /**
   * Doctors called at least once in the current span. Ids, not a count, so
   * unsynced calls can be unioned in without double-counting a doctor the
   * server already knows about.
   */
  thisMonthDoctorIds: string[];
  /**
   * The rep's standing plan for the month the span starts in: calls their
   * doctors' classes require, and every doctor assigned to them. Server-side
   * over the whole list, so Analytics doesn't inherit the doctor list's paging.
   */
  plannedCalls: number;
  assignedDoctors: number;
  /** The spans each figure covers (YYYY-MM-DD), so they can be labelled. */
  currentFrom?: string | null;
  currentTo?: string | null;
  previousFrom?: string | null;
  previousTo?: string | null;
}

/**
 * An explicit reporting period. Omitted entirely, every endpoint below falls
 * back to the current calendar month — the behaviour before Analytics could
 * pick a period.
 */
export interface CallPeriod {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
}

const periodKey = (period?: CallPeriod) =>
  period ? `${period.from}..${period.to}` : 'current-month';

export const monthlyCallTotalsKey = (mieId?: string, period?: CallPeriod) =>
  ['monthly-call-totals', mieId ?? 'no-mie', periodKey(period)] as const;

export const getMonthlyCallTotals = async (
  mieId: string,
  period?: CallPeriod,
): Promise<MonthlyCallTotals> => {
  const res = (await axios.get('/calls/monthly-totals', {
    params: { mieId, from: period?.from, to: period?.to },
  })) as unknown as { success: boolean } & MonthlyCallTotals;
  return {
    thisMonth: res.thisMonth ?? 0,
    previousMonth: res.previousMonth ?? 0,
    thisMonthSeconds: res.thisMonthSeconds ?? 0,
    previousMonthSeconds: res.previousMonthSeconds ?? 0,
    thisMonthDoctorIds: res.thisMonthDoctorIds ?? [],
    plannedCalls: res.plannedCalls ?? 0,
    assignedDoctors: res.assignedDoctors ?? 0,
    currentFrom: res.currentFrom ?? null,
    currentTo: res.currentTo ?? null,
    previousFrom: res.previousFrom ?? null,
    previousTo: res.previousTo ?? null,
  };
};

/**
 * Completed calls this month vs last, for the Analytics card. Cached (and
 * offline-persisted) — last month's figure is settled, and this month's is close
 * enough between refetches.
 */
export const useMonthlyCallTotals = (mieId?: string, period?: CallPeriod) => {
  const query = useQuery({
    queryKey: monthlyCallTotalsKey(mieId, period),
    queryFn: () => getMonthlyCallTotals(mieId as string, period),
    enabled: Boolean(mieId),
    staleTime: 5 * 60 * 1000,
  });
  const local = useLocalCalls();

  const data = useMemo(
    () => mergeMonthlyTotals(query.data, local, mieId, query.dataUpdatedAt, period),
    [query.data, query.dataUpdatedAt, local, mieId, period],
  );

  return { ...query, data };
};

/** One bar of an engagement breakdown: a specialty or a brand. */
export interface EngagementSlice {
  name: string;
  /** Average seconds of slide time per call. */
  seconds: number;
  /** Calls the average is taken over. */
  calls: number;
}

export interface EngagementBreakdown {
  bySpecialty: EngagementSlice[];
  byBrand: EngagementSlice[];
}

export const engagementKey = (mieId?: string, period?: CallPeriod) =>
  ['engagement', mieId ?? 'no-mie', periodKey(period)] as const;

export const getEngagement = async (
  mieId: string,
  period?: CallPeriod,
): Promise<EngagementBreakdown> => {
  const res = (await axios.get('/calls/engagement', {
    params: { mieId, from: period?.from, to: period?.to },
  })) as unknown as { success: boolean } & Partial<EngagementBreakdown>;
  return {
    bySpecialty: res.bySpecialty ?? [],
    byBrand: res.byBrand ?? [],
  };
};

/**
 * Average detailing time per call this month, by doctor specialty and by brand.
 * Cached (and offline-persisted) like the rest of the analytics figures.
 */
export const useEngagement = (mieId?: string, period?: CallPeriod) => {
  const query = useQuery({
    queryKey: engagementKey(mieId, period),
    queryFn: () => getEngagement(mieId as string, period),
    enabled: Boolean(mieId),
    staleTime: 5 * 60 * 1000,
  });
  const local = useLocalCalls();

  const data = useMemo(
    () => mergeEngagement(query.data, local, mieId, query.dataUpdatedAt, period),
    [query.data, query.dataUpdatedAt, local, mieId, period],
  );

  return { ...query, data };
};

/** One completed call in the month's history with a doctor. */
export interface DoctorCallRecord {
  callId: number;
  date: string;
  kind?: string | null;
  callType?: string | null;
  durationSeconds: number;
  slidesShown: number;
  slidesTotal: number;
  slidesSeconds: number;
  brands: string[];
  skus: string[];
  feedback?: string | null;
  feedbackComment?: string | null;
  sampleProvided: boolean;
}

export interface DoctorCallSummary {
  totalCalls: number;
  byKind: { chamber: number; group: number; parking: number };
  durationSeconds: number;
  slidesShown: number;
  slidesTotal: number;
  samplesProvided: number;
  brands: string[];
  skus: string[];
  /** Seconds spent per brand / per SKU across the month, highest first. */
  brandTimes: { name: string; seconds: number }[];
  skuTimes: { name: string; seconds: number }[];
  /** The doctor's class for this rep, and the month's quota it sets. */
  doctorClass?: string | null;
  maxVisits?: number | null;
  visitsDone?: number;
  /** Calls still owed this month; null when the class carries no quota. */
  remainingVisits?: number | null;
  /** Date of the most recent completed call, or null. */
  lastVisit?: string | null;
}

/** What the rep wrote down on one completed call with a doctor. */
export interface CallNote {
  /**
   * call_id for a note the server has; the client_call_id for one still
   * sitting in this device's ledger. Only ever used as a list key.
   */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** The quick-feedback chips, comma separated. */
  feedback?: string | null;
  /** The free-text note. */
  feedbackComment?: string | null;
}

export const lastCallFeedbackKey = (mieId?: string, doctorId?: string) =>
  ['last-call-feedback', mieId ?? 'no-mie', doctorId ?? 'no-doctor'] as const;

export const getCallNotes = async (
  mieId: string,
  doctorId: string,
): Promise<CallNote[]> => {
  const res = (await axios.get('/calls/last-feedback', {
    params: { mieId, doctorId },
  })) as unknown as {
    success: boolean;
    notes?: CallNote[] | null;
    feedback?: CallNote | null;
  };
  // `notes` is the list; `feedback` is the single newest note the endpoint
  // returned before it kept history, and is read as a fallback so an app
  // pointed at an older backend still shows the last call.
  if (Array.isArray(res.notes)) return res.notes;
  return res.feedback ? [res.feedback] : [];
};

/**
 * Every note this rep has written about this doctor, newest first, or an
 * empty list when there are none.
 *
 * Calls this device recorded are folded in too, so a note written on the last
 * visit is readable on the next one whether or not it has uploaded yet.
 */
export const useCallNotes = (mieId?: string, doctorId?: string) => {
  const query = useQuery({
    queryKey: lastCallFeedbackKey(mieId, doctorId),
    queryFn: () => getCallNotes(mieId as string, doctorId as string),
    enabled: Boolean(mieId && doctorId),
    staleTime: 60 * 1000,
  });
  const local = useLocalCalls();

  const data = useMemo(
    () => mergeCallNotes(query.data ?? [], local, mieId, doctorId),
    [query.data, local, mieId, doctorId],
  );

  return { ...query, data };
};

export interface DoctorCallSummaryResponse {
  success: boolean;
  summary: DoctorCallSummary;
  calls: DoctorCallRecord[];
}

export const doctorCallSummaryKey = (
  mieId?: string,
  doctorId?: string,
  kind?: string
) =>
  [
    'doctor-call-summary',
    mieId ?? 'no-mie',
    doctorId ?? 'no-doctor',
    kind ?? 'all-kinds',
  ] as const;

export const getDoctorCallSummary = async (
  mieId: string,
  doctorId: string,
  kind?: string
): Promise<DoctorCallSummaryResponse> => {
  return axios.get('/calls/doctor-summary', {
    params: { mieId, doctorId, kind },
  }) as unknown as Promise<DoctorCallSummaryResponse>;
};

/**
 * Everything this rep has done with a doctor this month — the calls themselves
 * plus the totals. Drives the completed-call analytics screen, which otherwise
 * only knows about the call just made (and nothing at all when reopened later).
 *
 * `kind` narrows it to one way of calling, so a report opened from the Group tab
 * reports on group calls rather than every call the doctor had.
 */
export const useDoctorCallSummary = (
  mieId?: string,
  doctorId?: string,
  kind?: string
) => {
  const query = useQuery({
    queryKey: doctorCallSummaryKey(mieId, doctorId, kind),
    queryFn: () => getDoctorCallSummary(mieId as string, doctorId as string, kind),
    enabled: Boolean(mieId && doctorId),
    staleTime: 60 * 1000,
  });
  // Calls this device made that the response can't include yet — folded in so
  // the report reads the same offline as it will once they upload.
  const local = useLocalCalls();

  const data = useMemo(
    () =>
      mergeDoctorSummary(query.data, local, {
        mieId,
        doctorId,
        kind,
        fetchedAt: query.dataUpdatedAt,
      }),
    [query.data, query.dataUpdatedAt, local, mieId, doctorId, kind],
  );

  return { ...query, data };
};
