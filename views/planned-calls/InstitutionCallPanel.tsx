import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useArrival } from '@/lib/location/useArrival';
import { useSpecialties } from '@/api/content';
import { AppBottomSheetSelect } from '@/components/ui/AppBottomSheetSelect';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ArrivedButton } from './doctor-detail/ArrivedButton';
import { CancelCallButton } from './doctor-detail/CancelCallButton';
import { CancelCallModal } from './doctor-detail/CancelCallModal';
import { StartCallButton } from './doctor-detail/StartCallButton';
import { ABANDONED_CANCEL_REASON, recordCancelledCall } from './recordCancelledCall';
import type { ArrivalCapture } from '@/lib/location/captureArrival';

/**
 * Group calls: several doctors at once, picked at the End of the call, with
 * forcing driven by a chosen specialty. Chamber and parking calls use the
 * doctor list instead.
 */
export function InstitutionCallPanel() {
  const { user } = useAuth();
  const [isCancelVisible, setIsCancelVisible] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Forcing for an institution call is driven by the chosen specialty. Only the
  // ones this rep has doctors for — the rest would offer nothing to pick at the
  // End of the call.
  const specialtiesQuery = useSpecialties(user?.mieId ? String(user.mieId) : undefined);
  const specialties = useMemo(() => specialtiesQuery.data ?? [], [specialtiesQuery.data]);
  const [selectedSpecialtyName, setSelectedSpecialtyName] = useState('');
  const specialtyOptions = useMemo(
    () => specialties.map((specialty) => specialty.specialty_name),
    [specialties],
  );
  const selectedSpecialty = useMemo(
    () => specialties.find((specialty) => specialty.specialty_name === selectedSpecialtyName),
    [specialties, selectedSpecialtyName],
  );
  const hasSpecialty = Boolean(selectedSpecialty);

  // A group call picks its doctors at the END (in the call summary), so the
  // panel only needs a specialty before Arrive.
  const readyToArrive = hasSpecialty;

  /**
   * Everything a cancelled group row carries, whatever cancelled it. Shared by
   * the rep's own cancellation and by the walk-away below, so the two rows
   * differ only in their reason.
   */
  const buildCancelDetails = (captured: ArrivalCapture | null) => ({
    tsoid: user?.mieId ? String(user.mieId) : '',
    // No doctor yet — a group call picks its attendees at the End.
    doctor_specialty: selectedSpecialty?.specialty_name,
    latitude: captured?.latitude,
    longitude: captured?.longitude,
    arrived_location: captured?.arrivedLocation,
    arrived_time: captured?.arrivedTime,
    call_type: 'planned' as const,
    institution_call_type: 'group' as const,
    created_by: Number(user?.userId) || undefined,
  });

  /**
   * The rep marked Arrived for a group call and then left the tab without
   * starting or cancelling it — recorded so the arrival is not lost. The row
   * carries the chosen specialty, the same as a cancelled group call does.
   */
  const { arrived, arrival, toggleArrived, reset, consume } = useArrival({
    onAbandon: (captured) => {
      const details = buildCancelDetails(captured);
      if (!details.tsoid) return;
      void recordCancelledCall(ABANDONED_CANCEL_REASON, details);
    },
  });

  // Changing the specialty invalidates the current arrival (a fresh vicinity
  // check belongs to the newly chosen specialty), so reset the Arrived state.
  // reset() withdraws it silently — picking a different specialty is a
  // correction on this screen, not the rep walking away from the call.
  const handleSpecialtyChange = (name: string) => {
    if (name === selectedSpecialtyName) return;
    setSelectedSpecialtyName(name);
    reset();
  };

  /**
   * Cancelling a group call records it the same way chamber and parking do. The
   * doctors were never picked (that happens at the End), so the row carries the
   * chosen specialty instead of a doctor.
   */
  const handleConfirmCancel = async (reason: string) => {
    const details = buildCancelDetails(arrival);
    if (!details.tsoid) {
      Alert.alert('Cannot cancel', 'Your rep profile is missing. Please sign in again.');
      return;
    }

    setIsCancelling(true);
    try {
      await recordCancelledCall(reason, details);
    } finally {
      setIsCancelling(false);
      setIsCancelVisible(false);
      reset();
    }
  };

  const handleStartCall = () => {
    // The arrival is now this call's, so leaving this tab must NOT report it
    // as a walk-away.
    consume();
    router.push({
      pathname: '/call/[id]',
      params: {
        id: 'institution-group',
        callType: 'planned',
        doctorName: 'Group Call',
        teamId: user?.teamId ? String(user.teamId) : undefined,
        specialtyId: selectedSpecialty ? String(selectedSpecialty.specialty_id) : undefined,
        // Carried through so the End-of-call doctor picker can say which
        // specialty it is limited to.
        specialtyName: selectedSpecialty?.specialty_name,
        institution: 'group',
        latitude: arrival?.latitude != null ? String(arrival.latitude) : undefined,
        longitude: arrival?.longitude != null ? String(arrival.longitude) : undefined,
        arrivedTime: arrival?.arrivedTime,
        arrivedLocation: arrival?.arrivedLocation,
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Specialty</Text>
        <AppBottomSheetSelect
          title="Select Specialty"
          placeholder={
            specialtiesQuery.isLoading ? 'Loading specialties...' : 'Select Specialty'
          }
          options={specialtyOptions}
          value={selectedSpecialtyName}
          onChange={handleSpecialtyChange}
          searchable={specialtyOptions.length > 6}
          emptyText="No specialties available."
        />
        <Text style={styles.helperText}>
          Forcing content is shown for the selected specialty.
        </Text>
      </View>

      <View style={styles.buttonsRow}>
        <View style={styles.buttonCellFull}>
          <ArrivedButton arrived={arrived} enabled={readyToArrive} onPress={toggleArrived} />
        </View>
        <View style={styles.buttonCellHalf}>
          <StartCallButton enabled={readyToArrive && arrived} onPress={handleStartCall} />
        </View>
        <View style={styles.buttonCellHalf}>
          <CancelCallButton enabled={arrived} onPress={() => setIsCancelVisible(true)} />
        </View>
      </View>

      <CancelCallModal
        visible={isCancelVisible}
        subject={
          selectedSpecialty
            ? `Group Call — ${selectedSpecialty.specialty_name}`
            : 'Group Call'
        }
        submitting={isCancelling}
        onDismiss={() => setIsCancelVisible(false)}
        onConfirm={(reason) => {
          void handleConfirmCancel(reason);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  helperText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    rowGap: 12,
  },
  buttonCellHalf: {
    width: '50%',
    height: 140,
    paddingHorizontal: 6,
  },
  buttonCellFull: {
    width: '100%',
    height: 140,
    paddingHorizontal: 6,
  },
});
