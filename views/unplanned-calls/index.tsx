import { AppButton } from '@/components/ui/AppButton';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useInfiniteDoctors } from '@/api/doctor';
import { useAuth } from '@/providers/AuthProvider';
import { Doctor, DoctorCard } from '@/views/planned-calls/DoctorCard';
import { DASH, mapDoctorRows } from '@/views/planned-calls/mapDoctor';
import { ScheduleSectionHeader } from '@/views/planned-calls/ScheduleSectionHeader';
import { getCompletedCallIds } from '@/views/planned-calls/callCompletionStore';
import { consumeReturnToNewDoctor } from '@/views/unplanned-calls/returnToNewDoctorStore';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// Doctors revealed per scroll, sliced from the fully-cached pool (no network).
const LIST_PAGE = 30;

const emptyNewDoctorForm = {
  name: '',
  profession: '',
  hospital: '',
  address: '',
};

export default function UnplannedCalls() {
  const { user } = useAuth();
  const [completedCallIds, setCompletedCallIds] = useState(() => getCompletedCallIds('unplanned'));
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [addedDoctors, setAddedDoctors] = useState<Doctor[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [newDoctorForm, setNewDoctorForm] = useState(emptyNewDoctorForm);
  const [newDoctorCallCompleted, setNewDoctorCallCompleted] = useState(false);
  const [activePendingDoctorId, setActivePendingDoctorId] = useState<string>();
  const [newDoctorDrafts, setNewDoctorDrafts] = useState<Record<string, typeof emptyNewDoctorForm>>({});
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);
  // No search query is sent to the API — the team pool is cached by the sync
  // and filtered locally (offline-first; the screen never calls the API).
  const doctorsQuery = useInfiniteDoctors({
    teamId: user?.teamId,
  });

  // Restart paging when the search changes.
  useEffect(() => {
    setVisibleCount(LIST_PAGE);
  }, [deferredSearchQuery]);

  const handlePendingNewDoctorReturn = useCallback((pendingDoctorId?: string) => {
    if (pendingDoctorId) {
      setAddedDoctors((current) => {
        if (current.some((doctor) => doctor.id === pendingDoctorId)) {
          return current;
        }

        return [
          ...current,
          {
            id: pendingDoctorId,
            name: 'New Doctor',
            specialty: 'Details Pending',
            hospital: 'Tap to complete profile',
            lastVisit: 'Call completed',
            status: 'completed',
            isNewDoctor: true,
            isNewDoctorPending: true,
          },
        ];
      });
      setActivePendingDoctorId(pendingDoctorId);
      setNewDoctorForm((current) => newDoctorDrafts[pendingDoctorId] ?? current);
    } else {
      setActivePendingDoctorId(undefined);
      setNewDoctorForm(emptyNewDoctorForm);
    }

    setPickerVisible(true);
    setNewDoctorCallCompleted(true);
  }, [newDoctorDrafts]);

  useFocusEffect(
    useCallback(() => {
      setCompletedCallIds(getCompletedCallIds('unplanned'));
      const pendingReturn = consumeReturnToNewDoctor();
      if (pendingReturn?.shouldOpenForm) {
        handlePendingNewDoctorReturn(pendingReturn.pendingDoctorId);
      }
    }, [handlePendingNewDoctorReturn])
  );

  const isNewDoctorFormValid = Boolean(
    newDoctorForm.name.trim()
      && newDoctorForm.profession.trim()
      && newDoctorForm.hospital.trim()
      && newDoctorForm.address.trim()
  );

  const doctors = useMemo(() => {
    const fetchedDoctors = mapDoctorRows(doctorsQuery.data?.pages.flatMap((page) => page.data) ?? []);
    const normalizedSearch = deferredSearchQuery.toLowerCase();
    const matchesSearch = (doctor: Doctor) =>
      [doctor.name, doctor.specialty].some(
        (value) => value?.toLowerCase().includes(normalizedSearch)
      );
    const filteredAddedDoctors = !normalizedSearch
      ? addedDoctors
      : addedDoctors.filter(matchesSearch);
    const filteredFetchedDoctors = !normalizedSearch
      ? fetchedDoctors
      : fetchedDoctors.filter(matchesSearch);

    return [...filteredAddedDoctors, ...filteredFetchedDoctors]
      .map((doctor) => ({
        ...doctor,
        status:
          doctor.status === 'completed' || completedCallIds.has(doctor.id)
            ? 'completed' as const
            : 'pending' as const,
      }))
      .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  }, [addedDoctors, completedCallIds, deferredSearchQuery, doctorsQuery.data?.pages]);

  const visibleDoctors = useMemo(
    () => doctors.slice(0, visibleCount),
    [doctors, visibleCount]
  );
  const hasActiveSearch = deferredSearchQuery.length > 0;

  const openPicker = () => {
    setNewDoctorCallCompleted(false);
    setActivePendingDoctorId(undefined);
    setNewDoctorForm(emptyNewDoctorForm);
    setPickerVisible(true);
  };

  const closePicker = (preserveDraft = true) => {
    if (preserveDraft && activePendingDoctorId) {
      setNewDoctorDrafts((current) => ({
        ...current,
        [activePendingDoctorId]: newDoctorForm,
      }));
    }

    setPickerVisible(false);
    setNewDoctorCallCompleted(false);
    setActivePendingDoctorId(undefined);
    setNewDoctorForm(emptyNewDoctorForm);
  };

  const updateNewDoctorField = (field: keyof typeof emptyNewDoctorForm, value: string) => {
    setNewDoctorForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const addSelectedDoctor = () => {
    if (!isNewDoctorFormValid) {
      return;
    }

    const newDoctor: Doctor = {
      id: activePendingDoctorId ?? `custom-${Date.now()}`,
      name: newDoctorForm.name.trim(),
      specialty: newDoctorForm.profession.trim(),
      hospital: newDoctorForm.hospital.trim(),
      address: newDoctorForm.address.trim(),
      lastVisit: DASH,
      status: 'completed',
      isNewDoctor: true,
    };

    setAddedDoctors((current) => {
      if (!activePendingDoctorId) {
        return [newDoctor, ...current];
      }

      return current.map((doctor) =>
        doctor.id === activePendingDoctorId ? newDoctor : doctor
      );
    });

    if (activePendingDoctorId) {
      setNewDoctorDrafts((current) => {
        const next = { ...current };
        delete next[activePendingDoctorId];
        return next;
      });
    }

    closePicker(false);
  };

  const startNewDoctorCall = () => {
    setPickerVisible(false);
    setNewDoctorCallCompleted(false);
    setActivePendingDoctorId(undefined);
    setNewDoctorForm(emptyNewDoctorForm);

    router.push({
      pathname: '/call/[id]',
      params: {
        id: `new-unplanned-${Date.now()}`,
        callType: 'unplanned',
        doctorName: 'New Doctor',
        returnToNewDoctor: '1',
      },
    });
  };

  const handleLoadMore = () => {
    // Reveal the next chunk from the already-cached pool — no API call, works
    // the same offline.
    setVisibleCount((count) =>
      count < doctors.length ? count + LIST_PAGE : count
    );
  };

  return (
    <ScreenLayout title="Unplanned Calls" notificationCount={1} scrollable={false}>
      <FlatList
        data={visibleDoctors}
        keyExtractor={(doctor) => doctor.id}
        renderItem={({ item }) => (
          <DoctorCard
            doctor={item}
            callType="unplanned"
            onPress={(selectedDoctor) => {
              if (!selectedDoctor.isNewDoctorPending) return false;

              setActivePendingDoctorId(selectedDoctor.id);
              setPickerVisible(true);
              setNewDoctorCallCompleted(true);
              setNewDoctorForm(newDoctorDrafts[selectedDoctor.id] ?? emptyNewDoctorForm);
              return true;
            }}
          />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.section}>
            <ScheduleSectionHeader
              title="Available Doctors"
              action={
                <AppButton
                  label="Add Doctor"
                  onPress={openPicker}
                  icon={<Ionicons name="add" size={20} color={Colors.textOnDark} />}
                  style={styles.addButton}
                  textStyle={styles.addButtonText}
                />
              }
            />

            {doctorsQuery.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.stateTitle}>Loading team doctors...</Text>
                <Text style={styles.stateText}>
                  Fetching all doctors available for the {user?.team ?? 'current'} team.
                </Text>
              </View>
            ) : null}

            {doctorsQuery.isError ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Unable to load team doctors</Text>
                <Text style={styles.stateText}>
                  {doctorsQuery.error instanceof Error ? doctorsQuery.error.message : 'Unknown error'}
                </Text>
              </View>
            ) : null}

            {!doctorsQuery.isLoading && !doctorsQuery.isError && doctors.length > 0 ? (
              <Text style={styles.summaryText}>
                Showing {visibleDoctors.length} of {doctors.length} team doctors for {user?.team ?? 'this team'}.
              </Text>
            ) : null}

            <AppSearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search team doctors by name or specialty"
            />

            {hasActiveSearch ? (
              <Text style={styles.searchHint}>
                Search results for "{deferredSearchQuery}"
              </Text>
            ) : null}

            {!doctorsQuery.isLoading && !doctorsQuery.isError && doctors.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No doctors available</Text>
                <Text style={styles.stateText}>
                  We did not find team doctor records for {user?.team ?? 'this team'} yet.
                </Text>
              </View>
            ) : null}
          </View>
        }
      />

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => closePicker()}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Unplanned Doctor</Text>
            <Text style={styles.modalSubtitle}>
              Start an unplanned call, then complete the new doctor details after the call.
            </Text>

            {newDoctorCallCompleted ? (
              <View style={styles.form}>
                <TextInput
                  value={newDoctorForm.name}
                  onChangeText={(value) => updateNewDoctorField('name', value)}
                  style={styles.input}
                  placeholder="Doctor name"
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  value={newDoctorForm.profession}
                  onChangeText={(value) => updateNewDoctorField('profession', value)}
                  style={styles.input}
                  placeholder="Profession"
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  value={newDoctorForm.hospital}
                  onChangeText={(value) => updateNewDoctorField('hospital', value)}
                  style={styles.input}
                  placeholder="Hospital"
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  value={newDoctorForm.address}
                  onChangeText={(value) => updateNewDoctorField('address', value)}
                  style={[styles.input, styles.addressInput]}
                  placeholder="Address"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ) : (
              <View style={styles.callPromptBox}>
                <Ionicons name="call-outline" size={22} color={Colors.primary} />
                <Text style={styles.callPromptTitle}>Start Doctor Call</Text>
                <Text style={styles.callPromptText}>
                  Start the unplanned call first. After the call is completed, you can add the new doctor details.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <AppButton
                label="Cancel"
                variant="secondary"
                onPress={closePicker}
                style={styles.modalButton}
              />
              <AppButton
                label={newDoctorCallCompleted ? 'Add Doctor' : 'Start Doctor Call'}
                onPress={newDoctorCallCompleted ? (isNewDoctorFormValid ? addSelectedDoctor : undefined) : startNewDoctorCall}
                icon={
                  newDoctorCallCompleted
                    ? <Ionicons name="add" size={20} color={Colors.textOnDark} />
                    : <Ionicons name="call-outline" size={20} color={Colors.textOnDark} />
                }
                style={[
                  styles.modalButton,
                  !newDoctorCallCompleted && styles.startCallButton,
                  newDoctorCallCompleted && !isNewDoctorFormValid && styles.modalButtonDisabled,
                ]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    // The same 16 as the other sides: a gap under the last item, nothing extra.
    paddingBottom: 16,
    gap: 10,
  },
  section: {
    gap: 12,
    marginBottom: 10,
  },
  addButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addButtonText: {
    fontSize: 14,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
  },
  searchHint: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
  },
  stateCard: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 8,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  stateText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 14,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
  },
  form: {
    gap: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  addressInput: {
    minHeight: 78,
    paddingTop: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
  },
  modalButtonDisabled: {
    opacity: 0.45,
  },
  callPromptBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  callPromptTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  callPromptText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  startCallButton: {
    backgroundColor: Colors.primary,
  },
});
