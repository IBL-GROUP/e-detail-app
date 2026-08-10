import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import axios from '@/config/axios';
import { ApiEndpoints } from '@/api/endpoints';
import { useLocalCalls } from '@/lib/offline/useLocalCalls';
import { mergeDoctorRows } from '@/lib/offline/localCallModels';
import type { LocalCall } from '@/lib/offline/callLedger';

export interface DoctorDataRow {
  TEAMID?: number;
  MieSasId?: number;
  MieName?: string;
  DOCTORID?: number;
  DOCTORNAME?: string;
  SpecialtyId?: number;
  SpecialtyByCommercial?: string;
  SpecialtyByIkon?: string;
  /** doctors.city */
  CITY?: string;
  // Doctor clinic location (stored as text in the DB). Day + evening clinics,
  // used to flag whether the rep's arrival GPS is within the clinic vicinity.
  DocLat?: string;
  DocLng?: string;
  DocEveLat?: string;
  DocEveLng?: string;
  ClinicAddress?: string;
  /** doctors.pmdc — the doctor's PMDC registration number. */
  PMDC?: string;
  /** The doctor's class for THIS rep (A1 / A2 / A3 / A4 ...). */
  DoctorClass?: string;
  /** Completed calls this rep has made on the doctor this month. */
  VisitCount?: number | null;
  /** Calls the class requires this month (A1:1 … A4:4). Null when unclassified. */
  MaxVisitCount?: number | null;
  /** 'completed' once the month's quota is met, else 'in_progress'. */
  VisitStatus?: string | null;
  /** This month's completed calls split by how they were conducted. */
  VisitsChamber?: number | null;
  VisitsGroup?: number | null;
  VisitsParking?: number | null;
  /** YYYY-MM-DD of the rep's most recent recorded call, null when never called. */
  LastVisit?: string | null;
}

export interface DoctorDataResponse {
  success: boolean;
  count: number;
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  source?: string;
  data: DoctorDataRow[];
}

interface DoctorQueryParams {
  mieId?: string;
  teamId?: number;
  query?: string;
}

interface DoctorRequestParams extends DoctorQueryParams {
  offset?: number;
  limit?: number;
}

const PAGE_SIZE = 30;
// A rep's planned doctors for the day is a bounded set, so fetch it all in one
// page. This keeps it fully available offline (no "load more" that fails with
// no network) and matches what the sync caches.
const PLANNED_PAGE_SIZE = 500;
// Same idea for the team's unplanned doctor pool (capped for offline caching).
const DOCTORS_PAGE_SIZE = 500;

export const doctorsKey = (teamId?: number, mieId?: string, query?: string) =>
  [
    'doctors',
    teamId ?? 'no-team',
    mieId ?? 'no-mie',
    query ?? 'no-query',
  ] as const;

const getDoctors = async ({
  mieId,
  teamId,
  query,
  offset = 0,
  limit = PAGE_SIZE,
}: DoctorRequestParams): Promise<DoctorDataResponse> => {
  return axios.get(ApiEndpoints.doctors, {
    params: {
      mieId,
      teamId,
      q: query,
      offset,
      limit,
    },
  }) as unknown as Promise<DoctorDataResponse>;
};

export const plannedDoctorsKey = (
  teamId?: number,
  mieId?: string,
  query?: string,
) =>
  [
    'planned-doctors',
    teamId ?? 'no-team',
    mieId ?? 'no-mie',
    query ?? 'no-query',
  ] as const;

export const getPlannedDoctors = async ({
  mieId,
  teamId,
  query,
  offset = 0,
  limit = PAGE_SIZE,
}: DoctorRequestParams): Promise<DoctorDataResponse> => {
  return axios.get(ApiEndpoints.plannedDoctors, {
    params: {
      mieId,
      teamId,
      q: query,
      offset,
      limit,
    },
  }) as unknown as Promise<DoctorDataResponse>;
};

export const plannedDoctorsPageParams = {
  initialPageParam: 0,
  getNextPageParam: (lastPage: DoctorDataResponse) =>
    lastPage.hasMore ? lastPage.offset + lastPage.count : undefined,
};

/**
 * Fold this device's calls into every page of a doctor list, so VisitCount /
 * LastVisit and the per-kind split read the same whether the call has reached
 * the server or is still sitting in the outbox. Every screen that shows a visit
 * tally — Call Reporting, Doctor List, the coverage card, the Analytics totals —
 * reads these rows, so merging here fixes all of them at once.
 */
function useMergedDoctorPages<
  T extends { pages: DoctorDataResponse[]; pageParams: unknown[] },
>(data: T | undefined, dataUpdatedAt: number, local: LocalCall[]) {
  return useMemo(() => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        data: mergeDoctorRows(page.data, local, dataUpdatedAt),
      })),
    };
  }, [data, dataUpdatedAt, local]);
}

export const useInfiniteDoctors = ({ mieId, teamId, query }: DoctorQueryParams) => {
  const result = useInfiniteQuery({
    queryKey: doctorsKey(teamId, mieId, query),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getDoctors({
        mieId,
        teamId,
        query,
        offset: pageParam,
        limit: DOCTORS_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.count : undefined,
    enabled: Boolean(teamId) && (Boolean(mieId) || mieId === undefined),
    staleTime: 5 * 60 * 1000,
  });

  const local = useLocalCalls();
  const data = useMergedDoctorPages(result.data, result.dataUpdatedAt, local);

  return { ...result, data };
};

export const useInfinitePlannedDoctors = ({ mieId, teamId, query }: DoctorQueryParams) => {
  const result = useInfiniteQuery({
    queryKey: plannedDoctorsKey(teamId, mieId, query),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getPlannedDoctors({
        mieId,
        teamId,
        query,
        offset: pageParam,
        limit: PLANNED_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.count : undefined,
    enabled: Boolean(teamId && mieId),
    staleTime: 5 * 60 * 1000,
  });

  const local = useLocalCalls();
  const data = useMergedDoctorPages(result.data, result.dataUpdatedAt, local);

  return { ...result, data };
};
