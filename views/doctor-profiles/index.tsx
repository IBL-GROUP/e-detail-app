import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useAssignedDoctors, useDoctorProfileMaster, type AssignedDoctor } from '@/api/doctorProfiles';
import { AssignedDoctorCard } from './AssignedDoctorCard';

// Doctors revealed per scroll, sliced from the cached list (no network).
const LIST_PAGE = 30;

/**
 * Doctor Info — the rep's assigned doctors, each to be profiled once
 * (FEAT-doctor-info-gathering).
 *
 * The doctors are the rep's planned list (the same doctors the Doctors card
 * shows), pending ones first, with progress in the header. Tapping a pending
 * doctor opens the profile form; a captured one opens the profile read-only.
 *
 * Offline like the patient log: the list comes from the persisted cache merged
 * with this device's profile queue, so a doctor profiled with no signal shows
 * as captured straight away and uploads on the next flush.
 */
export default function DoctorProfiles() {
  const { user } = useAuth();
  const mieId = user?.mieId ? String(user.mieId) : undefined;
  const userId = user?.userId != null ? String(user.userId) : undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);

  const assignedQuery = useAssignedDoctors(mieId, userId);
  // Warm the form's city / hospital / company lists while the rep is still
  // online, so the form works offline later.
  useDoctorProfileMaster();

  const { assigned, filled } = assignedQuery.meta;
  const progress = assigned > 0 ? filled / assigned : 0;

  const doctors = useMemo(() => {
    const all = assignedQuery.data;
    const search = deferredSearchQuery.toLowerCase();
    if (!search) return all;
    return all.filter((doctor) =>
      [doctor.doctorName, doctor.pmdcNumber, doctor.city, doctor.specialty].some((value) =>
        String(value ?? '').toLowerCase().includes(search),
      ),
    );
  }, [assignedQuery.data, deferredSearchQuery]);

  useEffect(() => {
    setVisibleCount(LIST_PAGE);
  }, [deferredSearchQuery]);

  const visibleDoctors = useMemo(() => doctors.slice(0, visibleCount), [doctors, visibleCount]);

  const openDoctor = (doctor: AssignedDoctor) => {
    router.push({
      pathname: '/doctor-profile/[pmdc]',
      params: { pmdc: doctor.pmdcNumber },
    });
  };

  return (
    <ScreenLayout title="Doctor Info" subtitle={user?.name} scrollable={false} showBack>
      <View style={styles.stickyHeader}>
        <View style={styles.stickyTitleBlock}>
          <View style={styles.stickyTitleRow}>
            <Text style={styles.stickyTitle}>Doctor Profiles</Text>
            <View style={styles.stickyCount}>
              <Text style={styles.stickyCountText}>
                {filled}/{assigned}
              </Text>
            </View>
          </View>
          <Text style={styles.stickySubtitle} numberOfLines={1}>
            {assigned > 0
              ? `${filled} of ${assigned} assigned doctors profiled`
              : 'Profile your assigned doctors'}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>

        <AppSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by doctor, PMDC or city"
        />
      </View>

      <FlatList
        data={visibleDoctors}
        keyExtractor={(doctor) => `${doctor.doctorId}-${doctor.pmdcNumber}`}
        renderItem={({ item }) => <AssignedDoctorCard doctor={item} onPress={openDoctor} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={() =>
          setVisibleCount((count) => (count < doctors.length ? count + LIST_PAGE : count))
        }
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          !assignedQuery.isLoading && doctors.length > 0 ? null : (
            <View style={styles.header}>
              {assignedQuery.isLoading ? (
                <View style={styles.stateCard}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.stateTitle}>Loading your doctors...</Text>
                </View>
              ) : (
                <View style={styles.stateCard}>
                  <Text style={styles.stateTitle}>
                    {deferredSearchQuery ? 'No matches' : 'No doctors to profile'}
                  </Text>
                  <Text style={styles.stateText}>
                    {deferredSearchQuery
                      ? 'No doctor matches this search.'
                      : assignedQuery.isError
                        ? 'Your doctor list could not be loaded. Connect to the internet and try again.'
                        : 'None of your assigned doctors has a PMDC number yet.'}
                  </Text>
                </View>
              )}
            </View>
          )
        }
      />
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
  // The patient log's raised header bar.
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
  stickyTitleBlock: {
    gap: 6,
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.success,
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
});
