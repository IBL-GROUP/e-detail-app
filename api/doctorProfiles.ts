import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import axios from '@/config/axios';
import {
  discardDoctorProfile,
  enqueueDoctorProfile,
  getLocalDoctorProfiles,
  subscribeDoctorProfileOutbox,
  type LocalDoctorProfile,
} from '@/lib/offline/doctorProfileOutbox';

/**
 * Doctor Information Gathering — the rep's doctor profiles, served by
 * /api/doctor-profiles (FEAT-doctor-info-gathering in the backend specs).
 *
 * Built like the patient log: the server half comes from the persisted React
 * Query cache, the device half from the profile queue, and the two are merged
 * so a profile captured offline counts as captured at once.
 */

/** One "other company" row: the share of the doctor's prescriptions it holds. */
export interface CompanyShare {
  company: string;
  percent: number;
}

/**
 * The profile fields, camelCase as the API takes them (DOC-DATA-001). Values are
 * strings as the form holds them; the server converts the numeric ones.
 */
export interface DoctorProfileFields {
  pmdcNumber: string;
  pmdcStatus: string;
  doctorName: string;
  fatherName: string;
  issueDate: string;
  religion: string;
  age: string;
  gender: string;
  cellNo: string;
  whatsappNo: string;
  digitalComfortLevel: string;
  primarySpeciality: string;
  secondarySpeciality: string;
  practiceLocations: string;
  practiceType: string;
  innovationAdoption: string;
  accessType: string;
  preferredInteractionStyle: string;
  rxStatus: string;
  rxPatterns: string;
  pharmacyOwnership: string;
  otherCompanyPrescribers: CompanyShare[];
  /**
   * The visiting card. A local file URI while the profile is queued, the
   * server path (/uploads/visiting-cards/...) once uploaded, and an absolute
   * URL in what the server sends back.
   */
  visitingCardUrl: string;
  primaryHospital: string;
  primaryCity: string;
  primarySession: string;
  primaryFee: string;
  primaryAvgTime: string;
  primaryPatientsPerDay: string;
  primaryOpdTiming: string;
  primaryBestVisitingTime: string;
  primaryAppointmentSystem: string;
  secondaryHospital: string;
  secondaryCity: string;
  secondarySession: string;
  secondaryFee: string;
  secondaryAvgTime: string;
  secondaryPatientsPerDay: string;
  secondaryOpdTiming: string;
  secondaryBestVisitingTime: string;
  secondaryAppointmentSystem: string;
}

/** What is queued and sent: the fields plus the offline upsert key and stamp. */
export interface DoctorProfileInput extends DoctorProfileFields {
  clientLocalId: string;
  clientUpdatedAt: string;
}

/**
 * A stored profile as the server returns it. Numeric columns may come back as
 * numbers, so every scalar is read through `String()` when shown.
 */
export type DoctorProfileRow = {
  [K in keyof DoctorProfileFields]?: DoctorProfileFields[K] extends string
    ? string | number | null
    : DoctorProfileFields[K];
} & {
  id: string;
  clientLocalId?: string | null;
  ownerId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** A profile as the screens render it: stored or device-only. */
export interface DoctorProfileListRow extends DoctorProfileRow {
  /** True while the profile is only on this device (queued, not yet uploaded). */
  isPending: boolean;
  /** Set for anything this device holds — what Discard acts on. */
  localId?: string;
  /** Why the last upload of a still-queued profile failed, if it did. */
  syncError?: string | null;
}

/** One of the rep's planned doctors, with whether they have profiled them. */
export interface AssignedDoctor {
  doctorId: string;
  pmdcNumber: string;
  doctorName: string;
  city: string;
  specialty: string;
  pmdcStatus: string;
  fatherName: string;
  issueDate: string;
  filled: boolean;
  profileId: string | null;
  /** Captured on this device and not uploaded yet. */
  isPending?: boolean;
}

export interface PmdcIdentity {
  pmdcNumber: string;
  pmdcStatus: string;
  doctorName: string;
  fatherName: string;
  issueDate: string;
}

export interface ProfileMaster {
  cities: { id: number; name: string }[];
  hospitals: { id: number; name: string; cityId: number }[];
  pharma: { id: number; name: string }[];
}

interface AssignedResponse {
  success: boolean;
  data: AssignedDoctor[];
  meta?: { assigned: number; filled: number };
}

interface ProfilesResponse {
  success: boolean;
  count: number;
  data: DoctorProfileRow[];
}

/** PMDC numbers compare trimmed and case-insensitive (DOC-BR-006). */
export const pmdcKey = (value: unknown) => String(value ?? '').trim().toUpperCase();

export const assignedDoctorsKey = (mieId?: string) =>
  ['doctor-profile-assigned', mieId ?? 'no-mie'] as const;
export const doctorProfilesKey = (userId?: string) =>
  ['doctor-profiles', userId ?? 'no-user'] as const;
export const profileMasterKey = ['doctor-profile-master'] as const;

/**
 * When each server list now in the cache was REQUESTED, per user — the same
 * guard the patient list uses so a profile uploaded after the request isn't
 * dropped from the screen before a later refetch includes it. Memory only.
 */
const listRequestedAt = new Map<string, number>();

const getProfiles = async (userId: string): Promise<DoctorProfileRow[]> => {
  const requestedAt = Date.now();
  const response = (await axios.get('/doctor-profiles')) as unknown as ProfilesResponse;
  listRequestedAt.set(userId, requestedAt);
  return response.data ?? [];
};

const getAssigned = async (mieId: string): Promise<AssignedDoctor[]> => {
  const response = (await axios.get('/doctor-profiles/assigned', {
    params: { mieId },
  })) as unknown as AssignedResponse;
  return response.data ?? [];
};

const getMaster = async (): Promise<ProfileMaster> => {
  const response = (await axios.get('/doctor-profiles/master')) as unknown as {
    success: boolean;
    data: ProfileMaster;
  };
  return {
    cities: response.data?.cities ?? [],
    hospitals: response.data?.hospitals ?? [],
    pharma: response.data?.pharma ?? [],
  };
};

/**
 * Look a PMDC number up in the master register (DOC-FR-010). Resolves to null
 * when the number is not there; throws when the server can't be reached, so the
 * form can tell "not found" from "offline".
 */
export async function lookupPmdc(pmdcNumber: string): Promise<PmdcIdentity | null> {
  try {
    const response = (await axios.get(
      `/doctor-profiles/pmdc/${encodeURIComponent(pmdcNumber.trim())}`,
    )) as unknown as { success: boolean; data: PmdcIdentity };
    return response.data ?? null;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 404 || status === 400) return null;
    throw error;
  }
}

/**
 * Every profile this device holds, whoever captured it — for the sync backlog,
 * which owes the server all of them. Screens use useLocalDoctorProfiles.
 */
export function useAllLocalDoctorProfiles(): LocalDoctorProfile[] {
  const [profiles, setProfiles] = useState<LocalDoctorProfile[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = () => {
      void getLocalDoctorProfiles().then((rows) => {
        if (mounted) setProfiles(rows);
      });
    };

    load();
    const unsubscribe = subscribeDoctorProfileOutbox(load);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return profiles;
}

/** This device's captured profiles for `userId`, kept live as the queue changes. */
export function useLocalDoctorProfiles(userId?: string): LocalDoctorProfile[] {
  const profiles = useAllLocalDoctorProfiles();
  return useMemo(
    () => (userId ? profiles.filter((entry) => entry.ownerId === userId) : []),
    [profiles, userId],
  );
}

/** A device-only profile, shaped like a stored row. */
function toListRow(local: LocalDoctorProfile): DoctorProfileListRow {
  return {
    ...local.profile,
    id: `local:${local.clientLocalId}`,
    clientLocalId: local.clientLocalId,
    createdAt: local.recordedAt,
    isPending: local.syncedAt == null,
    localId: local.clientLocalId,
    syncError: local.syncedAt == null ? local.lastError : null,
  };
}

/**
 * The device-held profiles the server list doesn't reflect yet: everything
 * unsynced, plus anything uploaded after the cached list was requested.
 */
function deviceOnlyProfiles(
  local: LocalDoctorProfile[],
  serverRows: DoctorProfileRow[],
  userId?: string,
): LocalDoctorProfile[] {
  const serverIds = new Set(
    serverRows.map((row) => row.clientLocalId).filter(Boolean).map(String),
  );
  const listedAsOf = userId ? (listRequestedAt.get(userId) ?? 0) : 0;
  return local.filter(
    (entry) =>
      entry.syncedAt == null ||
      (Date.parse(entry.syncedAt) > listedAsOf && !serverIds.has(entry.clientLocalId)),
  );
}

/**
 * The rep's captured profiles, newest first: the server's, with this device's
 * queued ones overriding or added on top. Both halves survive offline.
 */
export const useDoctorProfiles = (userId?: string) => {
  const query = useQuery({
    queryKey: doctorProfilesKey(userId),
    queryFn: () => getProfiles(userId as string),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  });

  const local = useLocalDoctorProfiles(userId);

  const data = useMemo<DoctorProfileListRow[]>(() => {
    const serverRows = query.data ?? [];
    const deviceOnly = deviceOnlyProfiles(local, serverRows, userId);
    const byClientId = new Map(deviceOnly.map((entry) => [entry.clientLocalId, entry]));

    const consumed = new Set<LocalDoctorProfile>();
    const merged: DoctorProfileListRow[] = serverRows.map((row) => {
      const match = row.clientLocalId ? byClientId.get(String(row.clientLocalId)) : undefined;
      if (!match || match.syncedAt != null) {
        return { ...row, isPending: false };
      }
      // An unsynced local version replaces the server's older copy.
      consumed.add(match);
      return {
        ...row,
        ...match.profile,
        id: row.id,
        createdAt: row.createdAt,
        isPending: true,
        localId: match.clientLocalId,
        syncError: match.lastError,
      };
    });

    const added = deviceOnly.filter((entry) => !consumed.has(entry)).map(toListRow);
    return [...added.filter((row) => row.isPending), ...added.filter((row) => !row.isPending), ...merged];
  }, [query.data, local, userId]);

  return { ...query, data };
};

/**
 * The rep's planned doctors with their captured state, pending first.
 *
 * A doctor captured on this device counts as captured immediately — the server
 * only learns of it on the next flush, and showing them as still pending is
 * exactly what got doctors profiled twice.
 */
export const useAssignedDoctors = (mieId?: string, userId?: string) => {
  const query = useQuery({
    queryKey: assignedDoctorsKey(mieId),
    queryFn: () => getAssigned(mieId as string),
    enabled: Boolean(mieId),
    staleTime: 5 * 60 * 1000,
  });

  const local = useLocalDoctorProfiles(userId);

  const data = useMemo<AssignedDoctor[]>(() => {
    const localByPmdc = new Map(local.map((entry) => [pmdcKey(entry.profile.pmdcNumber), entry]));

    const rows = (query.data ?? []).map((row) => {
      const entry = localByPmdc.get(pmdcKey(row.pmdcNumber));
      if (!entry) return row;
      return {
        ...row,
        filled: true,
        profileId: row.profileId ?? `local:${entry.clientLocalId}`,
        isPending: entry.syncedAt == null,
      };
    });

    return rows.sort((left, right) => {
      if (left.filled !== right.filled) return left.filled ? 1 : -1;
      return String(left.doctorName ?? '').localeCompare(String(right.doctorName ?? ''));
    });
  }, [query.data, local]);

  const filled = data.filter((row) => row.filled).length;
  return { ...query, data, meta: { assigned: data.length, filled } };
};

/** Cities, hospitals and pharma companies for the form, cached for offline use. */
export const useDoctorProfileMaster = () =>
  useQuery({
    queryKey: profileMasterKey,
    queryFn: getMaster,
    staleTime: 60 * 60 * 1000,
  });

/**
 * Capture a profile. Written to the device queue and resolved there — saving
 * works the same with or without signal; upload happens on the next flush.
 */
export const useSaveDoctorProfile = (userId?: string, mieId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    // The write is local, so it must run even when React Query thinks we are
    // offline — the default 'online' mode would pause it.
    networkMode: 'always',
    mutationFn: (payload: DoctorProfileFields & { clientLocalId?: string }) => {
      if (!userId) throw new Error('Your session has expired. Please sign in again.');
      return enqueueDoctorProfile(userId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: doctorProfilesKey(userId) });
      void queryClient.invalidateQueries({ queryKey: assignedDoctorsKey(mieId) });
    },
  });
};

/** Discard a profile that has not reached the server. */
export const useDiscardDoctorProfile = () =>
  useMutation({
    networkMode: 'always',
    mutationFn: (clientLocalId: string) => discardDoctorProfile(clientLocalId),
  });
