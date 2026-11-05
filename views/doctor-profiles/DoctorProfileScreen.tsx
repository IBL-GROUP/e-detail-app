import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/ui/AppButton';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useOutbox } from '@/providers/OutboxProvider';
import {
  pmdcKey,
  useAssignedDoctors,
  useDiscardDoctorProfile,
  useDoctorProfiles,
} from '@/api/doctorProfiles';
import { ProfileDetails } from './ProfileDetails';
import { ProfileForm } from './ProfileForm';
import { formatDoctorName } from './profileRules';

/**
 * Back to the assigned list. Explicitly, not router.back(): this screen lives
 * INSIDE the tab navigator, where back() walks the tab history and can leave
 * the rep where they were (or on another tab) — after Save that looked like
 * the button did nothing. The planned-calls doctor detail does the same.
 */
function backToList() {
  router.navigate('/doctor-profiles');
}

/**
 * One assigned doctor, by PMDC number: their captured profile, read-only, or
 * the form when they have not been profiled yet. A profile is captured once
 * and not edited afterwards (as in the Searle app); one that is still only on
 * this device can be discarded and captured again.
 */
export default function DoctorProfileScreen({ pmdc }: { pmdc: string }) {
  const { user } = useAuth();
  const mieId = user?.mieId ? String(user.mieId) : undefined;
  const userId = user?.userId != null ? String(user.userId) : undefined;
  const key = pmdcKey(pmdc);

  const assignedQuery = useAssignedDoctors(mieId, userId);
  const profilesQuery = useDoctorProfiles(userId);
  const discard = useDiscardDoctorProfile();
  const { flushNow } = useOutbox();

  const doctor = useMemo(
    () => assignedQuery.data.find((row) => pmdcKey(row.pmdcNumber) === key),
    [assignedQuery.data, key],
  );
  const profile = useMemo(
    () => profilesQuery.data.find((row) => pmdcKey(row.pmdcNumber) === key),
    [profilesQuery.data, key],
  );

  /**
   * Once the form has opened it stays until the screen navigates away. Saving
   * puts the profile on the device straight away, which flips `profile` and
   * `doctor.filled` while the save is still finishing — without this the form
   * was swapped mid-save for the profile view (or "Already profiled"), and the
   * final screen broke. (Deriving state from props during render is React's
   * documented pattern for this.)
   */
  const wantsForm = Boolean(!profile && doctor && !doctor.filled && userId);
  const [formOpen, setFormOpen] = useState(false);
  if (wantsForm && !formOpen) setFormOpen(true);

  // Tab screens stay mounted after the rep leaves them. Close the form on the
  // way out, so coming back to a doctor just saved shows the saved profile —
  // not the old Review step, whose Save would queue the profile a second time.
  // (An unfinished form is kept as a draft and restored when reopened.)
  useFocusEffect(
    useCallback(
      () => () => {
        setFormOpen(false);
      },
      [],
    ),
  );

  const [retrying, setRetrying] = useState(false);
  const retryUpload = async () => {
    setRetrying(true);
    try {
      await flushNow();
    } finally {
      setRetrying(false);
    }
  };

  // Searle's screen titles.
  const title = profile && !formOpen ? 'Doctor Details' : 'Add Doctor';
  const name = formatDoctorName(profile?.doctorName ?? doctor?.doctorName) || key;

  const confirmDiscard = (localId: string) => {
    Alert.alert(
      'Discard this profile?',
      'It has not been uploaded yet. Discarding removes it from your phone so you can capture it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () =>
            discard.mutate(localId, {
              onSuccess: (removed) => {
                if (!removed) {
                  Alert.alert('Already uploaded', 'This profile has reached the server and is kept.');
                }
              },
            }),
        },
      ],
    );
  };

  // Not profiled yet, and the doctor is on the rep's list — the form.
  if (formOpen && doctor && userId) {
    return (
      <ScreenLayout title={title} subtitle={name} scrollable={false} showBack>
        <ProfileForm
          doctor={doctor}
          userId={userId}
          mieId={mieId}
          onExit={backToList}
          onSaved={backToList}
        />
      </ScreenLayout>
    );
  }

  // A captured profile — shown read-only.
  if (profile) {
    return (
      <ScreenLayout title={title} subtitle={name} scrollable={false} showBack>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {profile.isPending ? (
            <View style={styles.pendingBanner}>
              <View style={styles.pendingRow}>
                <Ionicons name="cloud-upload-outline" size={18} color={Colors.warning} />
                <Text style={styles.pendingText}>
                  Saved on this phone. It uploads automatically when you are online.
                </Text>
              </View>
              {/* Why the last upload attempt failed, so "not saved" has a reason. */}
              {profile.syncError ? (
                <>
                  <Text style={styles.pendingError}>Last upload failed: {profile.syncError}</Text>
                  <AppButton
                    label={retrying ? 'Uploading…' : 'Retry Upload'}
                    variant="outline"
                    onPress={retrying ? undefined : () => void retryUpload()}
                    icon={<Ionicons name="refresh" size={16} color={Colors.primary} />}
                  />
                </>
              ) : null}
            </View>
          ) : null}
          <ProfileDetails profile={profile} />
          {profile.isPending && profile.localId ? (
            <AppButton
              label="Discard Profile"
              variant="outline"
              onPress={() => confirmDiscard(profile.localId as string)}
              style={styles.discard}
              textStyle={styles.discardText}
              icon={<Ionicons name="trash-outline" size={18} color={Colors.danger} />}
            />
          ) : null}
        </ScrollView>
      </ScreenLayout>
    );
  }

  const loading = assignedQuery.isLoading || profilesQuery.isLoading;

  return (
    <ScreenLayout title={title} subtitle={name} scrollable={false} showBack>
      <View style={styles.content}>
        <View style={styles.stateCard}>
          {loading ? (
            <>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.stateTitle}>Loading...</Text>
            </>
          ) : doctor?.filled ? (
            // The server says captured, but this device holds no copy of the
            // profile yet (first time on this phone, no signal).
            <>
              <Text style={styles.stateTitle}>Already profiled</Text>
              <Text style={styles.stateText}>
                The profile details will show here once you are online.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.stateTitle}>Doctor not found</Text>
              <Text style={styles.stateText}>
                This doctor is not on your assigned list.
              </Text>
            </>
          )}
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  pendingBanner: {
    gap: 10,
    borderRadius: 10,
    backgroundColor: Colors.warningBg,
    padding: 12,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingError: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  pendingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.warning,
  },
  discard: {
    borderColor: Colors.danger,
  },
  discardText: {
    color: Colors.danger,
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
});
