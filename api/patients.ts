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
}

/** What the Add Patient form submits. Everything but the name is optional. */
export type PatientLogInput = Omit<
  PatientLogRow,
  's_no' | 'created_at' | 'mie_id' | 'mie_name'
>;

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

    const serverIds = new Set(
      serverRows
        .map((row) => String(row.client_patient_id ?? ''))
        .filter(Boolean),
    );

    const pending = local
      .filter((entry) => !serverIds.has(entry.clientPatientId))
      .map(toListRow);

    // Local rows first: they are the newest by definition, and a rep who has
    // just recorded a patient expects to see them at the top.
    return [...pending, ...serverRows];
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
