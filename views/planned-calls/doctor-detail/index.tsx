import { Colors } from '@/constants/theme';
import { useArrival } from '@/lib/location/useArrival';
import { useAuth } from '@/providers/AuthProvider';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { CallType, type CallKind } from '../callTypes';
import { DASH } from '../mapDoctor';
import { recordCancelledCall } from '../recordCancelledCall';
// import { AddTokenButton } from './AddTokenButton'; // hidden for now
import { ArrivedButton } from './ArrivedButton';
import { CallCompletedCard } from './CallCompletedCard';
import { CancelCallButton } from './CancelCallButton';
import { CancelCallModal } from './CancelCallModal';
import { DoctorDetailHeader } from './DoctorDetailHeader';
import { MonthlyCallSummary } from '../call-analytics/MonthlyCallSummary';
import { MonthlyCoverageCard } from './MonthlyCoverageCard';
// PlannedCallsCard hidden for now; the item type is still used by DoctorDetailData.
import { PlannedCallItem } from './PlannedCallsCard';
import { ProfessionalDetailsCard } from './ProfessionalDetailsCard';
import { HistoryItem } from './RecentHistoryCard';
import { StartCallButton } from './StartCallButton';
import { ViewOnlyNotice } from './ViewOnlyNotice';

export interface DoctorDetailData {
  id: string;
  name: string;
  specialty: string;
  specialtyId?: number;
  /** Hospital — no source column in `doctors` yet */
  hospital: string;
  /** doctors.doc_clinic_address */
  address: string;
  /** doctors.city */
  city: string;
  /** Rep's last recorded call for this doctor (call_tracking), or a dash. */
  lastVisit: string;
  /** The doctor's class for this rep — A1 / A2 / A3 / A4 ... */
  doctorClass: string;
  /** doctors.pmdc */
  pmdcNumber: string;
  scheduledTime?: string;
  teamId?: number;
  /** This month's coverage: completed calls, the class quota, and the split. */
  visitCount?: number;
  maxVisits?: number | null;
  visitsChamber?: number;
  visitsGroup?: number;
  visitsParking?: number;
  history: HistoryItem[];
  plannedCalls?: PlannedCallItem[];
}

/** Detail fields fall back to a dash when the record has no value — don't send those. */
function omitDash(value?: string) {
  const text = value?.trim();
  return text && text !== DASH ? text : undefined;
}

interface DoctorDetailProps {
  doctor: DoctorDetailData;
  completed?: boolean;
  callType?: CallType;
  /** Chamber or parking — recorded against the call when it starts. */
  callKind?: CallKind;
  /**
   * Reference mode — the record without the call actions. Set when the screen is
   * opened from the Doctor List; calls are only started from Call Reporting.
   */
  viewOnly?: boolean;
}

export default function DoctorDetail({
  doctor,
  completed = false,
  callType = 'planned',
  callKind,
  viewOnly = false,
}: DoctorDetailProps) {
  const { user } = useAuth();
  const { arrived, arrival, toggleArrived, reset } = useArrival();
  const queryClient = useQueryClient();
  const [isCancelVisible, setIsCancelVisible] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Coming back to this doctor (from a call, or from the list after one) must
  // re-read the month's calls: the cached summary was fetched before the call
  // existed, and its 60s staleTime otherwise left the new call off the report.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['doctor-call-summary'] });
    }, [queryClient])
  );

  // Doctor detail lives INSIDE the tab navigator, so router.back() walks the tab
  // history and can land on whichever tab was focused before — the dashboard,
  // say — rather than the list the rep opened the doctor from. Go back to that
  // list explicitly instead.
  const listHref = viewOnly
    ? '/doctor-list'
    : callType === 'unplanned'
      ? '/unplanned-calls'
      : '/planned-calls';
  const goBackToList = () => router.navigate(listHref);
  // const [tokenAdded, setTokenAdded] = useState(false); // Add Card (Token) hidden

  /**
   * The screen is either a call to make or a record to read, never both. While
   * calls are still owed, the rep only needs the doctor's details and the call
   * actions — the month's coverage and the brand/SKU breakdown are noise they
   * have to scroll past to reach Arrived. Once the month's calls are done there
   * is nothing left to start, so the analytics take the buttons' place.
   * Doctor List opens the same screen purely as a reference, so it reads as
   * finished too.
   */
  const showAnalytics = completed || viewOnly;

  /**
   * Record the cancellation as a call_tracking row (call_outcome 'cancelled')
   * before clearing the arrival. Queued through the outbox, so a cancellation
   * made with no signal still reaches the server later.
   */
  const handleConfirmCancel = async (reason: string) => {
    const tsoid = user?.mieId ? String(user.mieId) : '';
    if (!tsoid) {
      Alert.alert('Cannot cancel', 'Your rep profile is missing. Please sign in again.');
      return;
    }

    setIsCancelling(true);
    try {
      await recordCancelledCall(reason, {
        tsoid,
        // Synthetic ids (new unplanned doctors) aren't real rows — omit them.
        doctorid: /^\d+$/.test(doctor.id) ? doctor.id : undefined,
        doctor_name: doctor.name,
        doctor_specialty: omitDash(doctor.specialty),
        pmdc: omitDash(doctor.pmdcNumber),
        latitude: arrival?.latitude,
        longitude: arrival?.longitude,
        arrived_location: omitDash(doctor.address) || arrival?.arrivedLocation || undefined,
        arrived_time: arrival?.arrivedTime,
        call_type: callType,
        institution_call_type: callKind,
        created_by: Number(user?.userId) || undefined,
      });
    } finally {
      setIsCancelling(false);
      setIsCancelVisible(false);
      reset();
      goBackToList();
    }
  };

  return (
    <View style={styles.screen}>
      <DoctorDetailHeader
        name={doctor.name}
        specialty={doctor.specialty}
        onBack={goBackToList}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ProfessionalDetailsCard
          hospital={doctor.hospital}
          address={doctor.address}
          city={doctor.city}
          lastVisit={doctor.lastVisit}
          doctorClass={doctor.doctorClass}
          pmdcNumber={doctor.pmdcNumber}
        />

        {showAnalytics ? (
          <>
            <MonthlyCoverageCard
              visitCount={doctor.visitCount ?? 0}
              maxVisits={doctor.maxVisits}
              chamber={doctor.visitsChamber ?? 0}
              group={doctor.visitsGroup ?? 0}
              parking={doctor.visitsParking ?? 0}
            />

            {/* The record itself: every call this month combined — brands,
                SKUs, where the time went. */}
            {(doctor.visitCount ?? 0) > 0 ? (
              <MonthlyCallSummary mieId={user?.mieId} doctorId={doctor.id} />
            ) : null}
          </>
        ) : null}

        {/* Planned Calls card hidden for now (placeholder schedule data). */}

        {viewOnly ? (
          <ViewOnlyNotice />
        ) : completed ? (
          <CallCompletedCard />
        ) : (
          <View style={styles.buttonsRow}>
            {/* Add Card (Token) hidden for now */}
            <View style={styles.buttonCellFull}>
              <ArrivedButton arrived={arrived} onPress={toggleArrived} />
            </View>
            <View style={styles.buttonCellHalf}>
              <StartCallButton
                enabled={arrived}
                onPress={() =>
                  router.push({
                    pathname: '/call/[id]',
                    params: {
                      id: doctor.id,
                      callType,
                      callKind,
                      doctorName: doctor.name,
                      specialtyId: doctor.specialtyId ? String(doctor.specialtyId) : undefined,
                      teamId: doctor.teamId ? String(doctor.teamId) : undefined,
                      latitude: arrival?.latitude != null ? String(arrival.latitude) : undefined,
                      longitude: arrival?.longitude != null ? String(arrival.longitude) : undefined,
                      arrivedTime: arrival?.arrivedTime,
                      arrivedLocation: arrival?.arrivedLocation,
                    },
                  })
                }
              />
            </View>
            <View style={styles.buttonCellHalf}>
              <CancelCallButton
                enabled={arrived}
                onPress={() => setIsCancelVisible(true)}
              />
            </View>
          </View>
        )}
        {/* <ContactInfoCard /> */}
      </ScrollView>

      <CancelCallModal
        visible={isCancelVisible}
        subject={doctor.name}
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
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
    marginTop: -36,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
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
