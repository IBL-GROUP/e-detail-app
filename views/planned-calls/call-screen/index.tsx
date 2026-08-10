import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { CallHeader } from './CallHeader';
import { SlideViewer } from './SlideViewer';
import { Slide } from './SlideCard';
import { CallSummaryData, CallSummaryModal } from './CallSummaryModal';
import { markCallCompleted } from '../callCompletionStore';
import { getLastCallDuration, setLastCallDuration } from '../lastCallStore';
import { CallType, type CallKind } from '../callTypes';
import { queueReturnToNewDoctor } from '@/views/unplanned-calls/returnToNewDoctorStore';
import { DoctorCallSlide, useForcingSlides } from '@/api/content';
import { useTeamSkus } from '@/api/sku';
import { useInfiniteDoctors, useInfinitePlannedDoctors, type DoctorDataRow } from '@/api/doctor';
import { useAuth } from '@/providers/AuthProvider';
import { useLockBack } from '@/hooks/use-lock-back';
import { enqueueCall } from '@/lib/offline/outbox';
import { nearestClinicVicinity } from '@/lib/location/distance';
import type { CallTrackingInput } from '@/api/calls';

const DEMO_SLIDES: Slide[] = [
  {
    id: '1',
    brand: 'Searle Pharmaceuticals',
    title: 'Cardio-Health Pro',
    subtitle: 'The Next Generation in Cardiac Care',
    durationSeconds: 10,
    bullets: ['Once-daily dosing', 'High bioavailability', 'Patient compliance focus'],
  },
  {
    id: '2',
    brand: 'Searle Pharmaceuticals',
    title: 'Clinical Efficacy',
    subtitle: 'Proven results in large-scale trials',
    durationSeconds: 20,
    bullets: [
      '92% reduction in adverse events',
      'Superior to standard of care',
      'Recommended by cardiologists',
    ],
  },
  {
    id: '3',
    brand: 'Searle Pharmaceuticals',
    title: 'Safety Profile',
    subtitle: 'Well tolerated across all age groups',
    durationSeconds: 30,
    bullets: ['Minimal side effects', 'No known drug interactions', 'Safe for long-term use'],
  },
];

interface CallScreenProps {
  doctorId?: string;
  callType?: CallType;
  doctorName?: string;
  returnToNewDoctor?: boolean;
  specialtyId?: number;
  /** Label for that specialty, used in the doctor picker's empty state. */
  specialtyName?: string;
  teamId?: number;
  // Institution call type ('group'); when set, the summary requires picking the
  // doctor(s) from the team, and forcing is resolved by specialty rather than by
  // the doctor.
  institutionType?: string;
  // How this call is conducted ('chamber' | 'parking'). Recorded on the call but
  // does NOT change the flow — chamber and parking behave identically.
  callKind?: CallKind;
  // Location captured when the rep marked "Arrived" (offline-capable GPS).
  arrivedLatitude?: number;
  arrivedLongitude?: number;
  arrivedTime?: string;
  arrivedLocation?: string;
}

function mapForcingSlides(slides: DoctorCallSlide[]): Slide[] {
  return slides.map((slide) => ({
    id: slide.id,
    brand: slide.brand,
    brandName: slide.brandName,
    skuName: slide.skuName,
    title: slide.title,
    subtitle: slide.subtitle,
    bullets: slide.bullets,
    durationSeconds: slide.durationSeconds,
    image: slide.image,
  }));
}

/**
 * Seconds spent per brand (or per SKU), summed across the deck's slides.
 *
 * Read from the slide's own `brandName` / `skuName` rather than its display
 * label: a BRAND-WISE forcing row has no SKU, and its subtitle falls back to the
 * brand name, so parsing the label would report the brand as though it were a
 * SKU. Slides with no value for the key are skipped — that's what makes a
 * brand-wise call come back with an empty SKU list.
 */
function aggregateSlideTimes(
  slides: Slide[],
  slideTimes: number[],
  key: 'brandName' | 'skuName'
) {
  const totals = new Map<string, number>();

  slides.forEach((slide, index) => {
    const name = (slide[key] ?? '').trim();
    if (!name) return;
    totals.set(name, (totals.get(name) ?? 0) + (slideTimes[index] ?? 0));
  });

  return [...totals.entries()].map(([name, seconds]) => ({ name, seconds }));
}

function getAnalyticsSlideLabel(slide: Slide) {
  const title = slide.title?.trim();
  const subtitle = slide.subtitle?.trim();

  if (title && subtitle) return `${title} - ${subtitle}`;
  return title || subtitle || slide.brand || 'Slide';
}

export default function CallScreen({
  doctorId,
  callType = 'planned',
  doctorName,
  returnToNewDoctor = false,
  specialtyId,
  specialtyName,
  teamId,
  institutionType,
  callKind,
  arrivedLatitude,
  arrivedLongitude,
  arrivedTime,
  arrivedLocation,
}: CallScreenProps) {
  const { user } = useAuth();
  // A call in progress is locked: the hardware back button does nothing, so the
  // only way out is forward through End Call (which records the call).
  useLockBack();
  const isInstitutionCall = Boolean(institutionType);
  // What gets stored in call_tracking.institution_call_type: 'group' for an
  // institution call, otherwise the chamber/parking mark from the list.
  const recordedCallKind = institutionType || callKind;
  // Group call: multiple doctors, picked at the END (in the summary) like walking
  // calls; recorded as one call_tracking row per attendee.
  const isGroupCall = institutionType === 'group';
  // Forcing is resolved by the chosen specialty for institution calls, and by the
  // doctor (their specialties) for doctor calls.
  const forcingDoctorId = isInstitutionCall ? undefined : doctorId;
  const forcingSpecialtyId = isInstitutionCall ? specialtyId : undefined;
  const hasForcingContext = Boolean(teamId && (forcingDoctorId || forcingSpecialtyId));
  const forcingSlidesQuery = useForcingSlides({
    teamId,
    doctorId: forcingDoctorId,
    specialtyId: forcingSpecialtyId,
  });
  // The team's SKUs, for the "Samples Provided" picker.
  const sampleOptions = useTeamSkus(teamId).data ?? [];
  // The team's (cached) doctor pool — used to resolve the real doctorid +
  // specialty for recording, for ANY call type (including unplanned team doctors).
  const teamDoctorsQuery = useInfiniteDoctors({ teamId });
  // This rep's OWN assigned doctors (doctor_team_mapping.tsoid = mieId). The
  // institution-call summary picker offers only these, not the whole team.
  const plannedDoctorsQuery = useInfinitePlannedDoctors({
    mieId: user?.mieId ? String(user.mieId) : undefined,
    teamId,
  });
  // When the call screen mounts is our best proxy for the call start time.
  const callStartRef = useRef(new Date().toISOString());
  const teamRows = useMemo(
    () => teamDoctorsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [teamDoctorsQuery.data?.pages],
  );
  const plannedRows = useMemo(
    () => plannedDoctorsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [plannedDoctorsQuery.data?.pages],
  );
  /**
   * Summary doctor picker = the rep's assigned doctors who still owe a call.
   *
   * A GROUP call is set up against one specialty, and its forcing content was
   * chosen for that specialty — so the doctors offered at the End of the call
   * are limited to the ones who hold it. Anything else would record a doctor as
   * having seen content meant for a different specialty.
   *
   * Doctors whose month is already covered are dropped: an A4 doctor with 4
   * calls (or an A2 with 2) has nothing left owing, and attributing another call
   * to them would push them past their class quota. Doctors with no class carry
   * no quota, so there is no limit for them to have reached — they stay.
   *
   * VisitCount here already includes calls made on this device that haven't
   * synced yet, so a doctor who hit their limit offline drops out immediately.
   */
  const doctorOptions = useMemo(() => {
    const rows =
      isInstitutionCall && specialtyId
        ? plannedRows.filter((row) => Number(row.SpecialtyId) === Number(specialtyId))
        : plannedRows;

    const withCallsOwed = rows.filter((row) => {
      const maxVisits = Number(row.MaxVisitCount) || 0;
      if (maxVisits <= 0) return true;
      return (Number(row.VisitCount) || 0) < maxVisits;
    });

    return [
      ...new Set(
        withCallsOwed.map((row) => String(row.DOCTORNAME ?? '').trim()).filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [plannedRows, isInstitutionCall, specialtyId]);
  // Resolve a doctor row by id (planned/known calls) or by name (institution
  // calls where the doctor is chosen in the summary). Built from the rep's
  // assigned doctors AND the team pool, so any picked/known doctor resolves.
  const resolvableRows = useMemo(
    () => [...plannedRows, ...teamRows],
    [plannedRows, teamRows],
  );
  const doctorById = useMemo(
    () => new Map(resolvableRows.map((row) => [String(row.DOCTORID ?? ''), row])),
    [resolvableRows],
  );
  const doctorByName = useMemo(
    () =>
      new Map(
        resolvableRows.map((row) => [String(row.DOCTORNAME ?? '').trim().toLowerCase(), row]),
      ),
    [resolvableRows],
  );
  const slides = !hasForcingContext
    ? DEMO_SLIDES
    : forcingSlidesQuery.data && forcingSlidesQuery.data.length > 0
      ? mapForcingSlides(forcingSlidesQuery.data)
      : forcingSlidesQuery.isLoading
        ? []
        : DEMO_SLIDES;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [slideTimes, setSlideTimes] = useState<number[]>([]);
  const [slidesViewed, setSlidesViewed] = useState(0);
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const hasEndedRef = useRef(false);

  const handleRequestEndCall = useCallback(() => {
    setIsSummaryVisible(true);
  }, []);

  const handleSlidesViewedChange = useCallback((count: number) => {
    setSlidesViewed((previous) => Math.max(previous, count));
  }, []);

  // A stable client-generated id per call (keyed so the 'started' insert and the
  // 'completed' update target the same call_tracking row via upsert). Group calls
  // key by doctorid (one call each); walking keys by a fixed 'walking' slot (its
  // doctor is chosen only at End); other calls key by their doctorid.
  const clientCallIdsRef = useRef<Map<string, string>>(new Map());
  const getClientCallId = useCallback((key: string) => {
    const existing = clientCallIdsRef.current.get(key);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    clientCallIdsRef.current.set(key, id);
    return id;
  }, []);

  // Doctor + arrival fields shared by the start and end payloads. `row` may be
  // absent (team pool not loaded yet, or a walking start with no doctor).
  const buildIdentityFields = useCallback(
    (row?: DoctorDataRow, effectiveDoctorName?: string) => {
      // Flag whether the rep's arrival GPS was within 50m of the doctor's clinic
      // (checks both day + evening locations). null when GPS or clinic coords are
      // missing. Out-of-vicinity calls are recorded and flagged, never blocked.
      const vicinity = nearestClinicVicinity(
        { latitude: arrivedLatitude, longitude: arrivedLongitude },
        {
          dayLat: row?.DocLat,
          dayLng: row?.DocLng,
          eveLat: row?.DocEveLat,
          eveLng: row?.DocEveLng,
        },
      );
      return {
        doctor_name: row?.DOCTORNAME || effectiveDoctorName || undefined,
        doctor_specialty: row?.SpecialtyByCommercial || row?.SpecialtyByIkon || undefined,
        pmdc: row?.PMDC || undefined,
        // The PREVIOUS visit as of this call (this call becomes the next one's).
        doctor_last_visit: row?.LastVisit || undefined,
        // Arrival GPS captured on the "Arrived" tap (works offline).
        latitude: arrivedLatitude,
        longitude: arrivedLongitude,
        // arrived_location = the doctor's clinic address; fall back to the
        // reverse-geocoded address of where the rep actually was.
        arrived_location: row?.ClinicAddress || arrivedLocation || undefined,
        arrived_time: arrivedTime || undefined,
        arrived_within_vicinity: vicinity?.withinVicinity,
        arrived_distance_meters: vicinity?.distanceMeters,
      };
    },
    [arrivedLatitude, arrivedLongitude, arrivedLocation, arrivedTime],
  );

  // Phase 1: record a 'started' row as soon as the call opens, with whatever is
  // known at start, so a call that is begun but never ended still leaves a trace.
  // The 'completed' update (recordCallToOutbox) reuses the same client_call_id.
  const recordStartToOutbox = useCallback(async () => {
    const tsoid = user?.mieId ? String(user.mieId) : '';
    if (!tsoid) return;

    // Start targets: institution calls (group + walking) pick their doctor(s) at
    // the End, so start a single doctor-less 'started' row (key 'institution');
    // other calls start with the incoming doctor id.
    const starts: { key: string; row?: DoctorDataRow; id?: string }[] = isInstitutionCall
      ? [{ key: 'institution' }]
      : [{ key: String(doctorId ?? ''), row: doctorById.get(String(doctorId ?? '')), id: String(doctorId ?? '') }];

    for (const target of starts) {
      // Doctor/group starts need a real (numeric) doctorid; a walking start has
      // no doctor yet (id undefined) and is allowed through.
      if (target.id != null && !/^\d+$/.test(target.id)) continue;

      const payload: CallTrackingInput = {
        client_call_id: getClientCallId(target.key),
        tsoid,
        doctorid: target.id || undefined,
        ...buildIdentityFields(target.row),
        call_start_time: callStartRef.current,
        call_type: callType,
        institution_call_type: recordedCallKind || undefined,
        call_outcome: 'started',
        created_by: Number(user?.userId) || undefined,
      };

      try {
        await enqueueCall(payload);
      } catch (error) {
        console.warn('[call] failed to queue call start for sync', error);
      }
    }
  }, [
    user?.mieId,
    user?.userId,
    isInstitutionCall,
    doctorById,
    doctorId,
    getClientCallId,
    buildIdentityFields,
    callType,
    recordedCallKind,
  ]);

  // Fire the start record once, when the call screen opens.
  const startRecordedRef = useRef(false);
  useEffect(() => {
    if (startRecordedRef.current) return;
    startRecordedRef.current = true;
    void recordStartToOutbox();
  }, [recordStartToOutbox]);

  // Phase 2: build the full call_tracking payload on End Call and hand it to the
  // offline outbox — this UPDATES the 'started' row (same client_call_id).
  const recordCallToOutbox = useCallback(
    async (summary: CallSummaryData, effectiveDoctorName?: string) => {
      const tsoid = user?.mieId ? String(user.mieId) : '';
      if (!tsoid) return; // can't attribute the call without a rep (tso) id

      // Resolve the target doctor row(s), keyed to match the start record. Group
      // and walking pick their doctor(s) in the summary; the FIRST attendee reuses
      // the 'institution' 'started' row (client_call_id), any others are new rows.
      // Doctor calls resolve by the incoming id.
      const resolveByName = (name: string) => {
        const row = doctorByName.get(name.trim().toLowerCase());
        return { row, id: row ? String(row.DOCTORID ?? '') : '' };
      };
      const targets = isGroupCall
        ? (summary.selectedDoctors ?? []).map((name, index) => {
            const { row, id } = resolveByName(name);
            return { key: index === 0 ? 'institution' : `institution-${id || name}`, row, id };
          })
        : isInstitutionCall && effectiveDoctorName
          ? [(() => {
              const { row, id } = resolveByName(effectiveDoctorName);
              return { key: 'institution', row, id: id || String(doctorId ?? '') };
            })()]
          : [(() => {
              const key = String(doctorId ?? '');
              const row = doctorById.get(key);
              return { key, row, id: row ? String(row.DOCTORID ?? '') : key };
            })()];

      const slideLabels = slides.map(getAnalyticsSlideLabel);
      const eachSlideTime: Record<string, number> = {};
      slideLabels.forEach((label, index) => {
        eachSlideTime[label] = slideTimes[index] ?? 0;
      });
      const slidesTotalSeconds = slideTimes.reduce((sum, n) => sum + (n || 0), 0);
      const jointCall = (summary.jointCall ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value && value.toLowerCase() !== 'no');
      const sampleProvided = Boolean(
        summary.samplesProvided && summary.samplesProvided !== 'None',
      );

      // Brands + SKUs shown in this call, linked: each SKU carries the id of its
      // brand. "Shown" = slides actually viewed (time > 0); fall back to the deck.
      const shownSlides = slides.filter((_, i) => (slideTimes[i] ?? 0) > 0);
      const effectiveShown = shownSlides.length > 0 ? shownSlides : slides;

      const brandIdByName = new Map<string, number>();
      const brandObjects: { id: number; name: string }[] = [];
      for (const slide of effectiveShown) {
        const name = (slide.brandName || '').trim();
        if (!name || brandIdByName.has(name)) continue;
        const id = brandObjects.length + 1;
        brandIdByName.set(name, id);
        brandObjects.push({ id, name });
      }

      // { name: seconds } maps for the jsonb timing columns.
      const toSecondsMap = (entries: { name: string; seconds: number }[]) =>
        entries.reduce<Record<string, number>>((map, entry) => {
          map[entry.name] = entry.seconds;
          return map;
        }, {});
      const brandSecondsByName = toSecondsMap(
        aggregateSlideTimes(slides, slideTimes, 'brandName')
      );
      const skuSecondsByName = toSecondsMap(
        aggregateSlideTimes(slides, slideTimes, 'skuName')
      );

      const seenSku = new Set<string>();
      const skuObjects: { brand_id: number | null; name: string }[] = [];
      for (const slide of effectiveShown) {
        const skuName = (slide.skuName || '').trim();
        if (!skuName || seenSku.has(skuName)) continue;
        seenSku.add(skuName);
        const brandName = (slide.brandName || '').trim();
        skuObjects.push({ brand_id: brandIdByName.get(brandName) ?? null, name: skuName });
      }

      // One call_tracking row per target doctor (group calls fan out; other call
      // types have a single target). Each UPDATES its 'started' row via the
      // shared client_call_id (keyed the same way as recordStartToOutbox).
      for (const { key, row: selectedRow, id: resolvedDoctorId } of targets) {
        // call_tracking.doctorid is a FK to doctors — only real (numeric) ids can
        // be recorded. Synthetic ids (new unplanned doctors, institution-* route
        // ids) and unresolved group doctors are skipped.
        if (!/^\d+$/.test(resolvedDoctorId)) continue;

        const payload: CallTrackingInput = {
          client_call_id: getClientCallId(key),
          tsoid,
          doctorid: resolvedDoctorId,
          ...buildIdentityFields(selectedRow, effectiveDoctorName),
          call_start_time: callStartRef.current,
          call_end_time: new Date().toISOString(),
          total_call_time_seconds: elapsedSeconds,
          total_slides_count: slides.length,
          shown_slides_count: slidesViewed,
          slides_total_time_seconds: slidesTotalSeconds,
          each_slide_time: eachSlideTime,
          // Seconds per brand and per SKU, so a month of calls can be charted
          // without re-deriving them from slide labels (a brand-wise deck has no
          // SKU, and its label repeats the brand name).
          brand_slide_time: brandSecondsByName,
          sku_slide_time: skuSecondsByName,
          // brand + sku as linked objects (jsonb columns).
          brand: brandObjects.length ? brandObjects : undefined,
          sku: skuObjects.length ? skuObjects : undefined,
          join_call: jointCall,
          sample_provided: sampleProvided,
          samples_json: sampleProvided
            ? { samples: [summary.samplesProvided] }
            : { samples: [] },
          feedback: summary.feedback || undefined,
          feedback_comment: summary.feedbackComment || undefined,
          call_type: callType,
          institution_call_type: recordedCallKind || undefined,
          // Explicit completion marker — this payload is only built on End Call →
          // submit, so the call is finished. Powers the Completed tab.
          call_outcome: 'completed',
          created_by: Number(user?.userId) || undefined,
        };

        try {
          await enqueueCall(payload);
        } catch (error) {
          console.warn('[call] failed to queue call for sync', error);
        }
      }
    },
    [
      user?.mieId,
      user?.userId,
      isInstitutionCall,
      isGroupCall,
      doctorByName,
      doctorById,
      doctorId,
      getClientCallId,
      buildIdentityFields,
      slides,
      slideTimes,
      elapsedSeconds,
      slidesViewed,
      callType,
      recordedCallKind,
    ],
  );

  const handleSubmitSummary = useCallback(
    (summary: CallSummaryData) => {
      if (hasEndedRef.current) return;

      // Walking calls carry the single doctor chosen in the summary; group calls
      // carry multiple, shown as a count in the analytics header.
      const groupCount = summary.selectedDoctors?.length ?? 0;
      const effectiveDoctorName =
        isGroupCall && groupCount > 0
          ? `Group Call · ${groupCount} doctor${groupCount === 1 ? '' : 's'}`
          : summary.selectedDoctor?.trim() || doctorName;

      // Combined feedback for the in-app analytics display (chips + comment).
      const displayFeedback =
        [summary.feedback, summary.feedbackComment].filter(Boolean).join(' — ') ||
        'No feedback provided';

      // Capture the PREVIOUS call's duration (before recording this one) so the
      // analytics can show how much longer/shorter this call was than the last.
      const previousDuration = getLastCallDuration();
      setLastCallDuration(elapsedSeconds);

      hasEndedRef.current = true;
      markCallCompleted(doctorId, callType, {
        doctorName: effectiveDoctorName,
        durationSeconds: elapsedSeconds,
        slidesViewed,
        totalSlides: slides.length,
        feedback: displayFeedback,
        doctorInterest: summary.doctorInterest,
        slideTimes,
        slideLabels: slides.map(getAnalyticsSlideLabel),
      });

      // Durably record the call to the outbox (written locally first, then
      // synced to call_tracking when online). Best-effort: never block the UI.
      void recordCallToOutbox(summary, effectiveDoctorName);

      if (callType === 'unplanned' && returnToNewDoctor) {
        queueReturnToNewDoctor(doctorId ?? 'unknown');
        router.replace('/(tabs)/unplanned-calls');
        return;
      }

      router.replace({
        pathname: '/call-analytics/[id]',
        params: {
          id: doctorId ?? 'unknown',
          callType,
          // This report is about the call just finished, not the whole month.
          mode: 'single',
          doctorName: effectiveDoctorName,
          duration: String(elapsedSeconds),
          previousDuration: previousDuration != null ? String(previousDuration) : '',
          slidesViewed: String(slidesViewed),
          totalSlides: String(slides.length),
          feedback: displayFeedback,
          doctorInterest: summary.doctorInterest,
          jointCall: summary.jointCall,
          samplesProvided: summary.samplesProvided,
          slideTimes: slideTimes.join(','),
          slideLabels: JSON.stringify(slides.map(getAnalyticsSlideLabel)),
          // Split explicitly: the chart is brand-wise, the rows under it are
          // SKU-wise, and a brand-wise deck sends an empty SKU list.
          brandTimes: JSON.stringify(aggregateSlideTimes(slides, slideTimes, 'brandName')),
          skuTimes: JSON.stringify(aggregateSlideTimes(slides, slideTimes, 'skuName')),
          // How this call was conducted, so its report can state it.
          callKind: recordedCallKind,
          returnToNewDoctor: returnToNewDoctor ? '1' : '0',
        },
      });
    },
    [
      callType,
      doctorId,
      doctorName,
      isGroupCall,
      elapsedSeconds,
      returnToNewDoctor,
      slideTimes,
      slides,
      slidesViewed,
      recordCallToOutbox,
    ]
  );

  return (
    <View style={styles.screen}>
      <CallHeader elapsedSeconds={elapsedSeconds} canEndCall onEndCall={handleRequestEndCall} />
      <View style={styles.body}>
        {hasForcingContext && forcingSlidesQuery.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Loading forcing content...</Text>
          </View>
        ) : null}
        <SlideViewer
          slides={slides}
          isPaused={isSummaryVisible || isTimerPaused}
          onTogglePause={() => setIsTimerPaused((value) => !value)}
          onElapsedChange={setElapsedSeconds}
          onSlideTimesChange={setSlideTimes}
          onSlidesViewedChange={handleSlidesViewedChange}
        />
      </View>
      <CallSummaryModal
        visible={isSummaryVisible}
        durationSeconds={elapsedSeconds}
        slidesViewed={slidesViewed}
        totalSlides={slides.length}
        sampleOptions={sampleOptions}
        requireDoctor={isInstitutionCall}
        multiDoctor={isGroupCall}
        doctorOptions={doctorOptions}
        doctorsEmptyText={
          // The list drops doctors whose month is already covered, so an empty
          // picker usually means "all done", not "none assigned".
          isInstitutionCall && specialtyName
            ? `No ${specialtyName} doctors still owe a call this month.`
            : 'No assigned doctors still owe a call this month.'
        }
        onCancel={() => setIsSummaryVisible(false)}
        onSubmit={handleSubmitSummary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  body: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingState: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
    elevation: 10,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
