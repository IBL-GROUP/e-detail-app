import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { CompletedToggle } from '@/components/ui/CompletedToggle';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useInfinitePlannedDoctors } from '@/api/doctor';
import { savePlannedForMie, seedPlannedFromBulk } from '@/lib/offline/plannedBulk';
import { completedDoctorIdsKey, useCompletedDoctorIds } from '@/api/calls';
import { CallKindSelector } from './CallKindSelector';
import type { CallKind } from './callTypes';
import { DoctorCard } from './DoctorCard';
import { mapDoctorRows } from './mapDoctor';
import { InstitutionCallPanel } from './InstitutionCallPanel';

// Doctors revealed per scroll, sliced from the fully-cached list (no network).
const LIST_PAGE = 30;

export default function PlannedCalls() {
  const { user } = useAuth();
  // The call kind is chosen per visit and defaults to the everyday chamber
  // (single-doctor) flow. All three kinds are available regardless of the
  // territory/institution mode, which lives in Settings only.
  const [callKind, setCallKind] = useState<CallKind>('chamber');
  const queryClient = useQueryClient();
  // Doctor ids the rep has RECORDED a call for today (server call_tracking,
  // with this device's not-yet-uploaded calls already folded in).
  const { data: serverCompletedIds } = useCompletedDoctorIds(user?.mieId);
  // On = doctors finished for the selected call kind; off = still to do.
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  // How many of the cached doctors are currently shown (client-side paging).
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);
  // No search query is sent to the API — the full list is cached by the sync
  // and we filter it locally (offline-first; the screen never calls the API).
  const doctorsQuery = useInfinitePlannedDoctors({
    mieId: user?.mieId,
    teamId: user?.teamId,
  });

  // The raw planned rows currently in cache (from online fetch, sync, or bulk).
  const plannedRows = useMemo(
    () => doctorsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [doctorsQuery.data?.pages]
  );

  // Persist this rep's loaded planned list locally so it survives logout and is
  // restored on the next login — even offline. Keyed by mieId.
  useEffect(() => {
    if (user?.mieId && plannedRows.length > 0) {
      void savePlannedForMie(String(user.mieId), plannedRows);
    }
  }, [user?.mieId, plannedRows]);

  // If the list is empty (e.g. just re-logged in offline after logout cleared
  // the cache), restore it from the on-device bulk store. seedPlannedFromBulk
  // only fills an empty cache, so this is safe to run alongside online fetches.
  useEffect(() => {
    if (user?.mieId && user?.teamId && plannedRows.length === 0) {
      void seedPlannedFromBulk(Number(user.teamId), String(user.mieId));
    }
  }, [user?.mieId, user?.teamId, plannedRows.length]);

  // Restart paging when the search, the toggle, or the call kind changes.
  useEffect(() => {
    setVisibleCount(LIST_PAGE);
  }, [deferredSearchQuery, showCompleted, callKind]);

  // Coming back from a call: refetch the server-side counts, so a call that just
  // synced shows its new visit tally rather than the figures this screen was
  // rendered with before the call. Calls that HAVEN'T synced need no refetch —
  // the call ledger already merges them into these queries.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['planned-doctors'] });
      void queryClient.invalidateQueries({
        queryKey: completedDoctorIdsKey(user?.mieId),
      });
    }, [queryClient, user?.mieId])
  );

  // A doctor is DONE only when the month's class quota is met — an A4 doctor
  // needs four calls, not one. The server decides that (doctor_tso_class_monthly_visit).
  const completedSet = useMemo(
    () => new Set<string>(serverCompletedIds ?? []),
    [serverCompletedIds]
  );

  const doctors = useMemo(() => {
    let mappedDoctors = mapDoctorRows(
      doctorsQuery.data?.pages.flatMap((page) => page.data) ?? []
    );

    const search = deferredSearchQuery.toLowerCase();
    if (search) {
      mappedDoctors = mappedDoctors.filter((doctor) =>
        [doctor.name, doctor.specialty].some(
          (value) => value?.toLowerCase().includes(search)
        )
      );
    }

    return mappedDoctors
      .map((doctor) => {
        // visitCount already includes this device's offline calls — the doctor
        // rows are merged with the call ledger before they reach this screen.
        const visitCount = doctor.visitCount ?? 0;

        // Done ONLY when the month's quota is met — an A2 doctor needs 2 calls,
        // an A4 needs 4. A doctor with no quota falls back to "called at all".
        const quotaMet = doctor.maxVisits
          ? visitCount >= doctor.maxVisits
          : completedSet.has(doctor.id);

        return {
          ...doctor,
          visitCount,
          status: quotaMet ? ('completed' as const) : ('pending' as const),
        };
      })
      .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  }, [completedSet, deferredSearchQuery, doctorsQuery.data?.pages]);

  /**
   * Completed FOR THE SELECTED CALL KIND: the doctor's monthly quota has to be
   * met AND they must actually have a call of this kind on record. So an A4
   * doctor with 2 chamber + 1 group + 1 parking shows as completed under all
   * three, while one still at 3/4 shows under none.
   */
  const isCompletedForKind = useCallback(
    (doctor: (typeof doctors)[number]) => {
      if (doctor.status !== 'completed') return false;

      const byKind: Record<CallKind, number> = {
        chamber: doctor.visitsChamber ?? 0,
        group: doctor.visitsGroup ?? 0,
        parking: doctor.visitsParking ?? 0,
      };

      return (byKind[callKind] ?? 0) > 0;
    },
    [callKind]
  );

  /**
   * Still owed a call — the month's quota isn't met yet.
   *
   * Independent of the call kind, unlike the Completed side. A doctor who
   * finished their four calls in the chamber owes nothing under Parking either,
   * and listing them as outstanding there meant tapping into a doctor with no
   * Start Call button on the other side.
   */
  const isOutstanding = useCallback(
    (doctor: (typeof doctors)[number]) => doctor.status !== 'completed',
    []
  );

  /**
   * Group is set up as ONE call whose attendees are chosen at the end, so its
   * list isn't a per-doctor worklist the way Chamber and Parking are — every
   * assigned doctor can be added. Its badge therefore counts all of them.
   */
  const activeCount = useMemo(
    () =>
      callKind === 'group'
        ? doctors.length
        : doctors.filter(isOutstanding).length,
    [callKind, doctors, isOutstanding]
  );
  const completedCount = useMemo(
    () => doctors.filter(isCompletedForKind).length,
    [doctors, isCompletedForKind]
  );

  // Toggle on → finished, and at least one call was of this kind; off → still
  // owed a call, whatever kind it ends up being.
  const filteredDoctors = useMemo(
    () =>
      doctors.filter((doctor) =>
        showCompleted ? isCompletedForKind(doctor) : isOutstanding(doctor)
      ),
    [doctors, showCompleted, isCompletedForKind, isOutstanding]
  );

  const visibleDoctors = useMemo(
    () => filteredDoctors.slice(0, visibleCount),
    [filteredDoctors, visibleCount]
  );

  const totalLoaded = doctors.length;
  const hasActiveSearch = deferredSearchQuery.length > 0;
  const sourceLabel = doctorsQuery.data?.pages[0]?.source;

  const handleLoadMore = () => {
    // Reveal the next chunk from the already-cached (filtered) list — no API
    // call, so it works the same offline.
    setVisibleCount((count) =>
      count < filteredDoctors.length ? count + LIST_PAGE : count
    );
  };

  const renderFooter = () => <View style={styles.footerSpacer} />;

  // Group calls replace the doctor listing with their own panel. Chamber and
  // parking both run the doctor-by-doctor flow below — identical apart from the
  // kind recorded against the call. The Call Type selector sits above either
  // view so the rep can switch without leaving the screen.
  // A group call is set up through its own panel (doctors are picked at the End
  // of the call, not before it). But its COMPLETED doctors are an ordinary list,
  // so the toggle swaps the panel out for one — otherwise Group was the only
  // kind where turning the toggle on showed a count and nothing else.
  const showInstitutionPanel = callKind === 'group' && !showCompleted;

  // Pinned above the Call Type selector: the count, the Completed toggle and
  // the search stay put while the list scrolls under them.
  const stickyHeader = (
    <View style={styles.stickyHeader}>
      <View style={styles.stickyTop}>
        <View style={styles.stickyTitleBlock}>
          <View style={styles.stickyTitleRow}>
            <Text style={styles.stickyTitle}>Assigned Doctors</Text>
            {/* Chamber and Parking count what's still OWED, so they carry the
                total to be a fraction of. Group's list is every assigned doctor
                and Completed is a plain tally — neither is out of anything. */}
            <View style={[styles.stickyCount, showCompleted && styles.stickyCountDone]}>
              <Text
                style={[
                  styles.stickyCountText,
                  showCompleted && styles.stickyCountTextDone,
                ]}
              >
                {showCompleted ? completedCount : activeCount}
                {!showCompleted && callKind !== 'group' ? (
                  <Text style={styles.stickyCountTotal}> / {totalLoaded}</Text>
                ) : null}
              </Text>
            </View>
          </View>
        </View>

        <CompletedToggle value={showCompleted} onChange={setShowCompleted} />
      </View>

      <AppSearchInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search doctors by name or specialty"
      />
    </View>
  );

  if (showInstitutionPanel) {
    return (
      // Same non-scrolling shell as the other kinds: ScreenLayout's scrollable
      // mode adds its own 16px padding, which double-inset the pinned header and
      // the Call Type card here but nowhere else. The panel scrolls on its own.
      <ScreenLayout title="Call Reporting" notificationCount={1} scrollable={false}>
        {stickyHeader}

        <CallKindSelector
          value={callKind}
          onChange={setCallKind}
          style={styles.callKindSelector}
        />

        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
        >
          <InstitutionCallPanel />
        </ScrollView>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Call Reporting" notificationCount={1} scrollable={false}>
      {stickyHeader}

      <CallKindSelector
        value={callKind}
        onChange={setCallKind}
        style={styles.callKindSelector}
      />
      <FlatList
        data={visibleDoctors}
        keyExtractor={(doctor) => doctor.id}
        renderItem={({ item }) => (
          <DoctorCard doctor={item} callType="planned" callKind={callKind} onPress={() => {}} />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.section}>
            {doctorsQuery.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.stateTitle}>Loading doctors...</Text>
                <Text style={styles.stateText}>
                  Fetching the doctor list for {user?.name ?? 'your account'}.
                </Text>
              </View>
            ) : null}

            {doctorsQuery.isError ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Unable to load doctors</Text>
                <Text style={styles.stateText}>
                  {doctorsQuery.error instanceof Error ? doctorsQuery.error.message : 'Unknown error'}
                </Text>
              </View>
            ) : null}

            {!doctorsQuery.isLoading && !doctorsQuery.isError && totalLoaded === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No doctors assigned</Text>
                <Text style={styles.stateText}>
                  We did not find doctor records for {user?.name ?? 'this rep'} yet.
                </Text>
              </View>
            ) : null}

            {sourceLabel === 'temporary-fallback' ? (
              <Text style={styles.sourceHint}>
                Temporary planned list from the rep doctor pool.
              </Text>
            ) : null}

            {!doctorsQuery.isLoading &&
            !doctorsQuery.isError &&
            totalLoaded > 0 &&
            filteredDoctors.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>
                  {showCompleted
                    ? `No completed ${callKind} calls yet`
                    : 'No doctors left to call'}
                </Text>
                <Text style={styles.stateText}>
                  {showCompleted
                    ? `Doctors finish here once their month's calls are done and one was a ${callKind} call.`
                    : 'Every assigned doctor has finished their calls for the month.'}
                </Text>
              </View>
            ) : null}

            {hasActiveSearch ? (
              <Text style={styles.searchHint}>
                Search results for &quot;{deferredSearchQuery}&quot;
              </Text>
            ) : null}
          </View>
        }
        ListFooterComponent={renderFooter}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  callKindSelector: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
  section: {
    gap: 12,
    marginBottom: 10,
  },
  // Pinned above the Call Type selector, so the count, toggle and search stay
  // reachable while the doctor list scrolls beneath them. Raised on its own
  // surface with a shadow — a flat strip just blended into the page.
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
  stickyTop: {
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
  stickyCount: {
    minWidth: 24,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  // Green while the Completed toggle is on, matching the toggle itself.
  stickyCountDone: {
    backgroundColor: Colors.successBg,
  },
  stickyCountText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.secondary,
  },
  stickyCountTextDone: {
    color: Colors.success,
  },
  // Same size and weight as the numerator — only the colour separates them.
  // Sizing them differently made the pair look misaligned rather than ranked.
  stickyCountTotal: {
    color: Colors.text,
  },
  panelScroll: {
    flex: 1,
  },
  // No horizontal padding here: InstitutionCallPanel already applies its own
  // 16px, and adding a second one inset its cards past the Call Type selector.
  panelContent: {
    paddingBottom: 32,
  },
  sourceHint: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
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
  footerSpacer: {
    height: 12,
  },
});
