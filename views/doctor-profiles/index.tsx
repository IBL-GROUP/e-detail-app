import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useDraftPmdcs } from '@/lib/offline/doctorProfileDrafts';
import {
  pmdcKey,
  useAssignedDoctors,
  useDoctorProfileMaster,
  type AssignedDoctor,
} from '@/api/doctorProfiles';
import { AssignedDoctorCard } from './AssignedDoctorCard';

// Doctors revealed per scroll, sliced from the cached list (no network).
const LIST_PAGE = 30;

/**
 * Searle's dashboard opens two lists — the assigned doctors still to fill
 * ("Unfilled") and the filled ones. Here they are one list with that filter.
 */
type Filter = 'all' | 'pending' | 'filled';

/**
 * Doctor Info — the rep's assigned doctors, each to be profiled once
 * (FEAT-doctor-info-gathering). The Searle app's "Select Doctor" screen:
 * title with the filled/assigned count, a hint, search, and one row per doctor
 * marked Pending, Draft or Captured.
 *
 * The doctors are the rep's planned list (the same doctors the Doctors card
 * shows), pending ones first. Tapping a pending doctor opens the profile form;
 * a captured one opens the profile read-only.
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
  const [filter, setFilter] = useState<Filter>('all');
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);

  const assignedQuery = useAssignedDoctors(mieId, userId);
  const draftPmdcs = useDraftPmdcs(userId);
  // Warm the form's city / hospital / company lists while the rep is still
  // online, so the form works offline later.
  useDoctorProfileMaster();

  const { assigned, filled } = assignedQuery.meta;
  const pending = Math.max(0, assigned - filled);
  const progress = assigned > 0 ? filled / assigned : 0;

  const doctors = useMemo(() => {
    const search = deferredSearchQuery.toLowerCase();
    return assignedQuery.data.filter((doctor) => {
      if (filter === 'pending' && doctor.filled) return false;
      if (filter === 'filled' && !doctor.filled) return false;
      if (!search) return true;
      return [doctor.doctorName, doctor.pmdcNumber, doctor.city, doctor.specialty].some((value) =>
        String(value ?? '').toLowerCase().includes(search),
      );
    });
  }, [assignedQuery.data, deferredSearchQuery, filter]);

  useEffect(() => {
    setVisibleCount(LIST_PAGE);
  }, [deferredSearchQuery, filter]);

  const visibleDoctors = useMemo(() => doctors.slice(0, visibleCount), [doctors, visibleCount]);

  const openDoctor = (doctor: AssignedDoctor) => {
    router.push({
      pathname: '/doctor-profile/[pmdc]',
      params: { pmdc: doctor.pmdcNumber },
    });
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: assigned },
    { key: 'pending', label: 'Pending', count: pending },
    { key: 'filled', label: 'Filled', count: filled },
  ];

  // The list failed and there is nothing cached to show.
  const failed = assignedQuery.isError && assignedQuery.data.length === 0;

  return (
    <ScreenLayout title="Doctor Info" subtitle={user?.name} scrollable={false} showBack>
      <View style={styles.stickyHeader}>
        <View style={styles.stickyTitleBlock}>
          <View style={styles.stickyTitleRow}>
            <Text style={styles.stickyTitle}>Select Doctor</Text>
            <View style={styles.stickyCount}>
              <Text style={styles.stickyCountText}>
                {filled}/{assigned} filled
              </Text>
            </View>
          </View>
          <Text style={styles.stickySubtitle}>
            Choose a doctor from your assigned list. Pending opens the form with PMDC verified.
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>

        <AppSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, PMDC, or city"
        />

        <View style={styles.filters}>
          {filters.map((entry) => {
            const active = filter === entry.key;
            return (
              <Pressable
                key={entry.key}
                onPress={() => setFilter(entry.key)}
                style={[styles.filter, active && styles.filterActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {entry.label} · {entry.count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={visibleDoctors}
        keyExtractor={(doctor) => `${doctor.doctorId}-${doctor.pmdcNumber}`}
        renderItem={({ item }) => (
          <AssignedDoctorCard
            doctor={item}
            hasDraft={!item.filled && draftPmdcs.has(pmdcKey(item.pmdcNumber))}
            onPress={openDoctor}
          />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              ) : failed ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateTitle}>List unavailable</Text>
                  <Text style={styles.stateText}>
                    Unable to load assigned doctors. Check your connection and try again.
                  </Text>
                  <AppButton
                    label={assignedQuery.isFetching ? 'Retrying…' : 'Retry'}
                    onPress={assignedQuery.isFetching ? undefined : () => void assignedQuery.refetch()}
                    style={styles.retry}
                  />
                </View>
              ) : (
                <View style={styles.stateCard}>
                  <Text style={styles.stateTitle}>
                    {deferredSearchQuery
                      ? 'No matches'
                      : filter === 'filled'
                        ? 'No filled doctors yet'
                        : filter === 'pending' && assigned > 0
                          ? 'All doctors filled'
                          : 'No assigned doctors'}
                  </Text>
                  <Text style={styles.stateText}>
                    {deferredSearchQuery
                      ? 'Try a different name or clear the search.'
                      : filter === 'filled'
                        ? 'Pick a pending doctor to start a new capture.'
                        : filter === 'pending' && assigned > 0
                          ? 'Every assigned doctor has a profile.'
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
    gap: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 16,
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
    justifyContent: 'space-between',
    gap: 8,
  },
  stickyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.secondary,
  },
  stickySubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textMuted,
  },
  stickyCount: {
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stickyCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  filter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 6,
  },
  filterActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5B6A7F',
  },
  filterTextActive: {
    color: Colors.textOnDark,
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
  retry: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
});
