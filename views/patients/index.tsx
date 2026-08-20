import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/ui/AppButton';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useSync } from '@/providers/SyncProvider';
import { useOutbox } from '@/providers/OutboxProvider';
import { useInfinitePlannedDoctors } from '@/api/doctor';
import { useSpecialties } from '@/api/content';
import { usePatients, useCreatePatient, type PatientLogInput } from '@/api/patients';
import { AddPatientModal } from './AddPatientModal';
import { PatientCard } from './PatientCard';

// Patients revealed per scroll, sliced from the cached list (no network).
const LIST_PAGE = 30;

/**
 * The rep's patient log — every patient they have recorded, newest first, with
 * Add Patient sitting above the list.
 *
 * Fully offline-capable, like call reporting. The list reads from the persisted
 * React Query cache merged with this device's own queue, and a new patient is
 * written to that queue first — so recording one works with no signal and
 * uploads on the next flush. Rows still waiting are marked "Pending sync".
 */
export default function Patients() {
  const { user } = useAuth();
  const { isOnline } = useSync();
  const { pendingPatientCount } = useOutbox();
  const mieId = user?.mieId ? String(user.mieId) : undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const patientsQuery = usePatients(mieId);
  const createPatient = useCreatePatient(mieId);

  // The rep's own doctors, for the form's doctor picker. Already cached by the
  // daily sync, so the picker is populated offline too.
  const doctorsQuery = useInfinitePlannedDoctors({
    mieId,
    teamId: user?.teamId,
  });
  const doctors = useMemo(
    () => doctorsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [doctorsQuery.data?.pages]
  );

  /**
   * Specialty names for the form's dropdown — the ones this rep actually holds
   * doctors for, cached and offline-persisted like the rest.
   *
   * Falls back to the specialties on the cached doctor rows if that query has
   * never run (a first launch with no signal), so the dropdown is never empty
   * when the doctor list isn't.
   */
  const specialtiesQuery = useSpecialties(mieId);
  const specialties = useMemo(() => {
    const fromApi = (specialtiesQuery.data ?? [])
      .map((entry) => String(entry.specialty_name ?? '').trim())
      .filter(Boolean);
    if (fromApi.length > 0) return fromApi;

    return [
      ...new Set(
        doctors
          .map((row) =>
            String(row.SpecialtyByCommercial ?? row.SpecialtyByIkon ?? '').trim()
          )
          .filter(Boolean)
      ),
    ];
  }, [specialtiesQuery.data, doctors]);

  // The `?? []` fallback lives inside the memo on purpose: as a bare const it
  // would be a fresh array every render, so the memo below would never hold.
  const patients = useMemo(() => {
    const allPatients = patientsQuery.data ?? [];
    const search = deferredSearchQuery.toLowerCase();
    if (!search) return allPatients;

    return allPatients.filter((patient) =>
      [patient.patient_name, patient.doctor, patient.city, patient.contact_number].some(
        (value) => value?.toLowerCase().includes(search)
      )
    );
  }, [patientsQuery.data, deferredSearchQuery]);

  // Restart paging whenever the search narrows the list.
  useEffect(() => {
    setVisibleCount(LIST_PAGE);
  }, [deferredSearchQuery]);

  const visiblePatients = useMemo(
    () => patients.slice(0, visibleCount),
    [patients, visibleCount]
  );

  const handleLoadMore = () => {
    setVisibleCount((count) => (count < patients.length ? count + LIST_PAGE : count));
  };

  const handleSubmit = (patient: PatientLogInput) => {
    setSubmitError(null);
    createPatient.mutate(patient, {
      onSuccess: () => setIsFormOpen(false),
      // Saving writes to the on-device queue, so connectivity can't fail it —
      // only local storage can. That is worth surfacing rather than swallowing,
      // because it means the patient was NOT recorded anywhere.
      onError: (error: any) =>
        setSubmitError(
          error?.message ||
            'Could not save this patient on the device. Please try again.'
        ),
    });
  };

  return (
    <ScreenLayout title="Patients" subtitle={user?.name} scrollable={false} showBack>
      <View style={styles.stickyHeader}>
        <View style={styles.stickyRow}>
          <View style={styles.stickyTitleBlock}>
            <View style={styles.stickyTitleRow}>
              <Text style={styles.stickyTitle}>Patient Log</Text>
              <View style={styles.stickyCount}>
                <Text style={styles.stickyCountText}>{patients.length}</Text>
              </View>
            </View>
            <Text style={styles.stickySubtitle} numberOfLines={1}>
              {pendingPatientCount > 0
                ? `${pendingPatientCount} waiting to sync`
                : isOnline
                  ? 'Patients you have recorded'
                  : 'Offline — new patients sync when you reconnect'}
            </Text>
          </View>

          <AppButton
            label="Add Patient"
            onPress={() => {
              setSubmitError(null);
              setIsFormOpen(true);
            }}
            icon={<Ionicons name="add" size={18} color={Colors.textOnDark} />}
          />
        </View>

        <AppSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by patient, doctor or city"
        />
      </View>

      <FlatList
        data={visiblePatients}
        keyExtractor={(patient) => String(patient.s_no)}
        renderItem={({ item }) => <PatientCard patient={item} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.header}>
            {patientsQuery.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.stateTitle}>Loading patients...</Text>
              </View>
            ) : null}

            {!patientsQuery.isLoading && patients.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No patients yet</Text>
                <Text style={styles.stateText}>
                  {deferredSearchQuery
                    ? 'No patient matches this search.'
                    : 'Tap Add Patient to record your first one.'}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={<View style={styles.footerSpacer} />}
      />

      <AddPatientModal
        visible={isFormOpen}
        doctors={doctors}
        specialties={specialties}
        submitting={createPatient.isPending}
        errorMessage={submitError}
        onCancel={() => {
          setSubmitError(null);
          setIsFormOpen(false);
        }}
        onSubmit={handleSubmit}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
  },
  // Raised on its own surface so it reads as a bar over the list — the same
  // treatment the Doctor List header gets.
  stickyHeader: {
    gap: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 5,
  },
  stickyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stickyTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  stickyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stickyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  stickySubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  stickyCount: {
    minWidth: 24,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stickyCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.secondary,
  },
  header: {
    gap: 12,
    paddingBottom: 4,
  },
  stateCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 6,
    alignItems: 'center',
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  stateText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  footerSpacer: {
    height: 24,
  },
});
