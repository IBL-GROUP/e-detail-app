import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import axios from '@/config/axios';
import {
  enqueuePatient,
  getLocalPatients,
  subscribePatientOutbox,
  type LocalPatient,
} from '@/lib/offline/patientOutbox';

/**
 * The rep's patient log — one row per patient they have recorded, shaped to the
 * backend `patient_log` columns.
 *
 * `s_no` and `created_at` are assigned by the database; `mie_id` / `mie_name`
 * are filled server-side from the signed-in rep, so neither is part of the form.
 */
export interface PatientLogRow {
  s_no: number;
  /** The client-generated upsert key — set for anything this app recorded. */
  client_patient_id?: string | null;
  mie_id?: string | null;
  mie_name?: string | null;
  patient_name: string;
  contact_number?: string | null;
  city?: string | null;
  /** Street address — free text, longer than the other fields (varchar 500). */
  address?: string | null;
  /** How the product is given — 'Oral' or 'PFS'. */
  oral_pfs?: string | null;
  strength_month_1?: string | null;
  strength_month_2?: string | null;
  strength_month_3?: string | null;
  indication?: string | null;
  dose?: string | null;
  doctor_id?: string | null;
  doctor?: string | null;
  speciality?: string | null;
  created_at?: string | null;
  /**
   * The uploaded images.
   *
   * On the wire this is a list: absolute URLs coming back from the server,
   * and — while a patient is still queued on the device — local file URIs of
   * photos that haven't been uploaded yet. The server stores the paths in
   * `patient_log.attachment` as a JSON array.
   */
  attachments?: string[];
}

/**
 * What the form submits. Everything but the name is optional.
 *
 * `s_no` rides along only when EDITING, to identify the row being changed —
 * the server updates by it when there is no client_patient_id to upsert on.
 */
export type PatientLogInput = Omit<
  PatientLogRow,
  's_no' | 'created_at' | 'mie_id' | 'mie_name'
> & { s_no?: number };

/**
 * A patient row as the list renders it: the stored columns plus whether this
 * device is still waiting for the server to accept it.
 */
export interface PatientListRow extends PatientLogRow {
  /** True while the patient is only on this device (queued, not yet uploaded). */
  isPending: boolean;
}

interface PatientsResponse {
  success: boolean;
  count: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  data: PatientLogRow[];
}

export const patientsKey = (mieId?: string) =>
  ['patients', mieId ?? 'no-mie'] as const;

const getPatients = async (mieId: string): Promise<PatientLogRow[]> => {
  // No search term is sent — the whole log is cached and filtered on-device, so
  // the list still works with no signal (the same approach the doctor lists take).
  const response = (await axios.get('/patients', {
    params: { mieId },
  })) as unknown as PatientsResponse;
  return response.data ?? [];
};

/** This device's recorded patients, kept live as the queue changes. */
function useLocalPatients(): LocalPatient[] {
  const [patients, setPatients] = useState<LocalPatient[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = () => {
      void getLocalPatients().then((rows) => {
        if (mounted) setPatients(rows);
      });
    };

    load();
    const unsubscribe = subscribePatientOutbox(load);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return patients;
}

/** A queued patient, shaped like a stored row so the list can render it. */
function toListRow(local: LocalPatient, index: number): PatientListRow {
  return {
    ...local.patient,
    // Nothing on the device has a real s_no yet — the database assigns it on
    // upload. A negative placeholder keeps list keys unique and can't collide
    // with a server row.
    s_no: -(index + 1),
    client_patient_id: local.clientPatientId,
    created_at: local.recordedAt,
    isPending: true,
  };
}

/**
 * This rep's recorded patients, newest first.
 *
 * Server rows and this device's queued ones are merged: anything recorded here
 * that the server response doesn't carry yet is shown on top, flagged pending.
 * De-duplication is by client_patient_id — once a refetch returns the patient,
 * the server's copy takes over and the local one drops out, so a patient is
 * never listed twice.
 *
 * Both halves survive offline: the server half from the persisted React Query
 * cache, the local half from the device queue.
 */
export const usePatients = (mieId?: string) => {
  const query = useQuery({
    queryKey: patientsKey(mieId),
    queryFn: () => getPatients(mieId as string),
    enabled: Boolean(mieId),
    staleTime: 60 * 1000,
  });

  const local = useLocalPatients();

  const data = useMemo<PatientListRow[]>(() => {
    const serverRows = (query.data ?? []).map((row) => ({
      ...row,
      isPending: false,
    }));

    /**
     * Unsynced local rows OVERRIDE the server's copy of the same patient.
     *
     * An edit made offline re-queues the row under its existing identity, so
     * the server still holds the old version. Merely de-duplicating would show
     * that stale copy and the rep's change would look like it never happened —
     * so a local row that hasn't synced replaces the server row it matches,
     * keeping the server's s_no and created_at so the card reads correctly.
     */
    const unsynced = local.filter((entry) => entry.syncedAt == null);
    const byClientId = new Map(
      unsynced
        .filter((entry) => entry.patient.client_patient_id)
        .map((entry) => [String(entry.patient.client_patient_id), entry]),
    );
    const bySNo = new Map(
      unsynced
        .filter((entry) => entry.patient.s_no != null)
        .map((entry) => [Number(entry.patient.s_no), entry]),
    );

    const consumed = new Set<LocalPatient>();
    const merged = serverRows.map((row) => {
      const match =
        (row.client_patient_id
          ? byClientId.get(String(row.client_patient_id))
          : undefined) ?? bySNo.get(Number(row.s_no));
      if (!match) return row;

      consumed.add(match);
      return {
        ...row,
        ...match.patient,
        s_no: row.s_no,
        created_at: row.created_at,
        isPending: true,
      };
    });

    // Whatever didn't match an existing row is a brand-new patient.
    const added = unsynced
      .filter((entry) => !consumed.has(entry))
      .map(toListRow);

    // New ones first: a rep who has just recorded a patient expects them on top.
    return [...added, ...merged];
  }, [query.data, local]);

  return { ...query, data };
};

/**
 * Record a patient.
 *
 * The row is written to the device queue and the mutation resolves there — it
 * does NOT wait on the network, so saving works identically with or without
 * signal. Upload happens on the next flush (immediately when online, on
 * reconnect otherwise), and the server upserts on client_patient_id so a replay
 * can't duplicate the patient.
 */
export const useCreatePatient = (mieId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    // The write is local, so it must run whether or not React Query thinks we
    // are online — the default 'online' mode would pause it offline, which is
    // exactly the case this queue exists to handle.
    networkMode: 'always',
    mutationFn: (payload: PatientLogInput) => enqueuePatient(payload),
    onSuccess: () => {
      // Harmless offline (the fetch is paused and the cache stands); online it
      // pulls the server's own copy back once the flush lands.
      void queryClient.invalidateQueries({ queryKey: patientsKey(mieId) });
    },
  });
};
