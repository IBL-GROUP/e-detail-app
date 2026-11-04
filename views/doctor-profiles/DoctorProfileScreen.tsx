import { useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/ui/AppButton';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import {
  pmdcKey,
  useAssignedDoctors,
  useDiscardDoctorProfile,
  useDoctorProfiles,
} from '@/api/doctorProfiles';
import { ProfileDetails } from './ProfileDetails';
import { ProfileForm } from './ProfileForm';
import { formatDoctorName } from './profileRules';

/** Back to the assigned list (or the dashboard when opened without history). */
function backToList() {
  if (router.canGoBack()) router.back();
  else router.replace('/doctor-profiles');
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

  const doctor = useMemo(
    () => assignedQuery.data.find((row) => pmdcKey(row.pmdcNumber) === key),
    [assignedQuery.data, key],
  );
  const profile = useMemo(
    () => profilesQuery.data.find((row) => pmdcKey(row.pmdcNumber) === key),
    [profilesQuery.data, key],
  );

  const title = profile ? 'Doctor Profile' : 'Profile Doctor';
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

  // A captured profile — shown read-only.
  if (profile) {
    return (
      <ScreenLayout title={title} subtitle={name} scrollable={false} showBack>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {profile.isPending ? (
            <View style={styles.pendingBanner}>
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.warning} />
              <Text style={styles.pendingText}>
                Saved on this phone. It uploads automatically when you are online.
              </Text>
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

  // Not profiled yet, and the doctor is on the rep's list — the form.
  if (doctor && !doctor.filled && userId) {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: Colors.warningBg,
    padding: 12,
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
