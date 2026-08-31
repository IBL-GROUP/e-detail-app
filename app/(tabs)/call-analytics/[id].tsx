import { useLocalSearchParams } from 'expo-router';
import CallAnalytics, { type AnalyticsMode } from '@/views/planned-calls/call-analytics';
import { CallType } from '@/views/planned-calls/callTypes';
import { useAuth } from '@/providers/AuthProvider';

/** Route params arrive as `string | string[]`; take the first either way. */
function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumber(value: string | string[] | undefined, fallback = 0) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSlideTimes(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return [];

  return rawValue
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

/** Parses the `[{ name, seconds }]` brand/SKU breakdowns the call screen sends. */
function parseNamedTimes(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        seconds: Number(item?.seconds) || 0,
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

/** A JSON string[] param — currently the slide labels. */
function parseStringList(value: string | string[] | undefined) {
  const rawValue = firstParam(value);
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/** The group call's attendees: `[{ name, lastVisit }]`, lastVisit possibly null. */
function parseAttendees(value: string | string[] | undefined) {
  const rawValue = firstParam(value);
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        lastVisit: item?.lastVisit ? String(item.lastVisit) : null,
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

export default function CallAnalyticsRoute() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id: string;
    duration?: string;
    previousDuration?: string;
    slidesViewed?: string;
    totalSlides?: string;
    feedback?: string;
    doctorInterest?: 'High' | 'Medium' | 'Low';
    jointCall?: string;
    samplesProvided?: string;
    slideTimes?: string;
    slideLabels?: string;
    brandTimes?: string;
    skuTimes?: string;
    callType?: CallType;
    callKind?: string;
    mode?: string;
    doctorName?: string;
    doctorAttendees?: string;
    returnToNewDoctor?: string;
  }>();

  const doctorId = Array.isArray(params.id) ? params.id[0] : params.id;
  const normalizedCallType: CallType = params.callType === 'unplanned' ? 'unplanned' : 'planned';
  const doctorName = Array.isArray(params.doctorName) ? params.doctorName[0] : params.doctorName;
  const returnToNewDoctor =
    (Array.isArray(params.returnToNewDoctor) ? params.returnToNewDoctor[0] : params.returnToNewDoctor) === '1';

  // Empty string = no previous call to compare against (first call this session).
  const rawPrevDuration = Array.isArray(params.previousDuration)
    ? params.previousDuration[0]
    : params.previousDuration;
  const previousDurationSeconds =
    rawPrevDuration && Number.isFinite(Number(rawPrevDuration))
      ? Number(rawPrevDuration)
      : undefined;

  // Set explicitly by whoever opened the screen: the call screen sends 'single',
  // the Completed list sends 'combined'. Inferring it from the presence of call
  // params was unreliable — a stale in-session report made a list tap look like
  // a fresh call. Falls back to that inference only for older links.
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawDuration = Array.isArray(params.duration) ? params.duration[0] : params.duration;
  const mode: AnalyticsMode =
    rawMode === 'combined' || rawMode === 'single'
      ? rawMode
      : rawDuration
        ? 'single'
        : 'combined';
  const callKind = Array.isArray(params.callKind) ? params.callKind[0] : params.callKind;

  return (
    <CallAnalytics
      doctorName={doctorName}
      doctorAttendees={parseAttendees(params.doctorAttendees)}
      doctorId={doctorId}
      mieId={user?.mieId}
      mode={mode}
      callKind={callKind}
      callType={normalizedCallType}
      durationSeconds={parseNumber(params.duration)}
      previousDurationSeconds={previousDurationSeconds}
      slidesViewed={parseNumber(params.slidesViewed)}
      totalSlides={parseNumber(params.totalSlides, 1)}
      feedback={params.feedback || 'No feedback provided'}
      doctorInterest={params.doctorInterest}
      // Sent by the call screen since the summary was added, but never read
      // here — so the report could not state who joined or what was handed over.
      jointCall={firstParam(params.jointCall)}
      samplesProvided={firstParam(params.samplesProvided)}
      slideTimes={parseSlideTimes(params.slideTimes)}
      slideLabels={parseStringList(params.slideLabels)}
      brandTimes={parseNamedTimes(params.brandTimes)}
      skuTimes={parseNamedTimes(params.skuTimes)}
      returnToNewDoctor={returnToNewDoctor}
    />
  );
}
