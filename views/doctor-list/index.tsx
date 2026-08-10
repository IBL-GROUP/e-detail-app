import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useInfinitePlannedDoctors } from '@/api/doctor';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { CompletedToggle } from '@/components/ui/CompletedToggle';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { mapDoctorRows } from '@/views/planned-calls/mapDoctor';
import { DoctorListCard } from './DoctorListCard';

// Doctors revealed per scroll, sliced from the fully-cached list (no network).
const LIST_PAGE = 30;

/**
 * The rep's full doctor book — every doctor mapped to this MIE, browsable
 * outside of call reporting. Reads the same cached planned-doctor list the sync
 * fills, so it works offline. This is a REFERENCE view: tapping a card opens the
 * doctor record in view-only mode, with no call actions. Calls are started from
 * Call Reporting.
 */
export default function DoctorList() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);
  // On = only doctors whose whole month's quota is met.
  const [showCompleted, setShowCompleted] = useState(false);

  const doctorsQuery = useInfinitePlannedDoctors({
    mieId: user?.mieId,
    teamId: user?.teamId,
  });

  const allDoctors = useMemo(
    () => mapDoctorRows(doctorsQuery.data?.pages.flatMap((page) => page.data) ?? []),
    [doctorsQuery.data?.pages]
  );

  /**
   * Done for the month across EVERY call kind — this screen is the combined
   * view, so an A4 doctor counts once they reach 4 calls however they were
   * conducted. The per-kind split lives on Call Reporting.
   */
  const completedCount = useMemo(
    () =>
      allDoctors.filter(
        (doctor) => doctor.maxVisits && (doctor.visitCount ?? 0) >= doctor.maxVisits
      ).length,
    [allDoctors]
  );

  const doctors = useMemo(() => {
    let mapped = allDoctors;

    if (showCompleted) {
      mapped = mapped.filter(
        (doctor) => doctor.maxVisits && (doctor.visitCount ?? 0) >= doctor.maxVisits
      );
    }

    const search = deferredSearchQuery.toLowerCase();
    if (!search) return mapped;

    return mapped.filter((doctor) =>
      [doctor.name, doctor.specialty].some((value) =>
        value?.toLowerCase().includes(search)
      )
    );
  }, [allDoctors, deferredSearchQuery, showCompleted]);

  // Restart paging whenever the search or the toggle narrows the list.
  useEffect(() => {
    setVisibleCount(LIST_PAGE);
  }, [deferredSearchQuery, showCompleted]);

  const visibleDoctors = useMemo(
    () => doctors.slice(0, visibleCount),
    [doctors, visibleCount]
  );

  const handleLoadMore = () => {
    setVisibleCount((count) => (count < doctors.length ? count + LIST_PAGE : count));
  };

  return (
    <ScreenLayout title="Doctor List" subtitle={user?.name} scrollable={false} showBack>
      {/* Pinned: the combined completion filter and the search stay reachable
          while the book scrolls beneath them. */}
      <View style={styles.stickyHeader}>
        <View style={styles.stickyRow}>
          <View style={styles.stickyTitleBlock}>
            <View style={styles.stickyTitleRow}>
              <Text style={styles.stickyTitle}>
                {showCompleted ? 'Completed Doctors' : 'All Doctors'}
              </Text>
              <View style={styles.stickyCount}>
                <Text style={styles.stickyCountText}>{doctors.length}</Text>
              </View>
            </View>
            <Text style={styles.stickySubtitle} numberOfLines={1}>
              {showCompleted
                ? "Monthly calls complete"
                : `${completedCount} of ${allDoctors.length} complete this month`}
            </Text>
          </View>

          <CompletedToggle value={showCompleted} onChange={setShowCompleted} />
        </View>

        <AppSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name or specialty"
        />
      </View>

      <FlatList
        data={visibleDoctors}
        keyExtractor={(doctor) => doctor.id}
        renderItem={({ item }) => <DoctorListCard doctor={item} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.header}>
            {doctorsQuery.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.stateTitle}>Loading doctors...</Text>
              </View>
            ) : null}

            {!doctorsQuery.isLoading && doctors.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No doctors found</Text>
                <Text style={styles.stateText}>
                  {deferredSearchQuery
                    ? 'No doctor matches this search.'
                    : showCompleted
                      ? 'No doctor has finished their monthly calls yet.'
                      : `We did not find doctor records for ${user?.name ?? 'this rep'} yet.`}
                </Text>
              </View>
            ) : null}

          </View>
        }
        ListFooterComponent={<View style={styles.footerSpacer} />}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  // Roomier gap: the cards are airier now, so they need space to read as cards.
  content: {
    padding: 16,
    gap: 14,
  },
  // Raised on its own surface so it reads as a bar over the list, not a strip
  // of loose text on the page background.
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
