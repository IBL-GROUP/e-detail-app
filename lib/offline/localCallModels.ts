import type {
  CallTrackingInput,
  DoctorCallRecord,
  DoctorCallSummary,
  DoctorCallSummaryResponse,
  EngagementBreakdown,
  EngagementSlice,
  SlideEngagementBreakdown,
  SlideEngagementSlide,
  CallNote,
  MonthlyCallTotals,
} from '@/api/calls';
import type { DoctorDataRow } from '@/api/doctor';
import type { LocalCall } from './callLedger';

/**
 * The server's read models, recomputed on the device.
 *
 * Every figure the app shows about calls — a doctor's month summary, the visit
 * counts on the lists, the analytics totals — is aggregated by the backend from
 * `call_tracking`. Offline, that data simply doesn't exist yet, so the screens
 * fell back to whatever the last online response happened to say and a call made
 * with no signal was invisible until it uploaded.
 *
 * These helpers apply the SAME aggregations to the local ledger and fold the
 * result into the cached server response, so the numbers are identical whether
 * the call has reached the server or not.
 *
 * DOUBLE-COUNTING is prevented by time, not by ids: a local call is folded in
 * only when the server response predates its sync (or it hasn't synced at all).
 * Once a refetch happens after the upload, the server's own copy takes over.
 */

/** An explicit reporting period, as the analytics screen selects one. */
export interface LocalPeriod {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
}

/**
 * Calls this device recorded that the given server response cannot include.
 *
 * `period` scopes them the same way the server query does. Without it the
 * current calendar month applies, which is what every caller but Analytics
 * wants.
 */
export function pendingCalls(
  local: LocalCall[],
  serverFetchedAt: number,
  period?: LocalPeriod,
): CallTrackingInput[] {
  return local
    .filter(({ call, syncedAt }) => {
      if (call.call_outcome !== 'completed') return false;
      // Synced strictly before the response was fetched → already in it.
      if (syncedAt != null && serverFetchedAt > 0 && syncedAt <= serverFetchedAt) {
        return false;
      }

      if (period) {
        const day = isoDate(callDate(call));
        return day >= period.from && day <= period.to;
      }

      return isThisMonth(callDate(call));
    })
    .map(({ call }) => call);
}

function callDate(call: CallTrackingInput): Date {
  const raw = call.call_start_time ?? call.call_end_time;
  const parsed = raw ? new Date(raw) : new Date(NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isThisMonth(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  );
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A stable NEGATIVE id for a local-only call, so it can't collide with a real call_id. */
function localCallId(clientCallId: string): number {
  let hash = 0;
  for (let i = 0; i < clientCallId.length; i += 1) {
    hash = (hash * 31 + clientCallId.charCodeAt(i)) | 0;
  }
  return -Math.abs(hash || 1);
}

function namesOf(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String((entry as { name?: unknown })?.name ?? '').trim())
    .filter(Boolean);
}

function secondsMap(value: unknown): [string, number][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([name, seconds]) => [name.trim(), Number(seconds) || 0] as [string, number])
    .filter(([name, seconds]) => Boolean(name) && seconds > 0);
}

function addSeconds(target: Map<string, number>, entries: [string, number][]) {
  for (const [name, seconds] of entries) {
    target.set(name, (target.get(name) ?? 0) + seconds);
  }
}

function sortedEntries(map: Map<string, number>) {
  return [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** Shape one local call the way GET /calls/doctor-summary returns its calls. */
function toDoctorCallRecord(call: CallTrackingInput): DoctorCallRecord {
  return {
    callId: localCallId(call.client_call_id),
    date: isoDate(callDate(call)),
    kind: call.institution_call_type ?? null,
    callType: call.call_type ?? null,
    durationSeconds: Number(call.total_call_time_seconds) || 0,
    slidesShown: Number(call.shown_slides_count) || 0,
    slidesTotal: Number(call.total_slides_count) || 0,
    slidesSeconds: Number(call.slides_total_time_seconds) || 0,
    brands: namesOf(call.brand),
    skus: namesOf(call.sku),
    feedback: call.feedback ?? null,
    feedbackComment: call.feedback_comment ?? null,
    sampleProvided: Boolean(call.sample_provided),
  };
}

/**
 * Fold this device's calls into a doctor's month summary — the same totals the
 * backend builds in GET /calls/doctor-summary.
 */
export function mergeDoctorSummary(
  server: DoctorCallSummaryResponse | undefined,
  local: LocalCall[],
  options: { mieId?: string; doctorId?: string; kind?: string; fetchedAt: number },
): DoctorCallSummaryResponse | undefined {
  const { mieId, doctorId, kind, fetchedAt } = options;
  if (!mieId || !doctorId) return server;

  const extra = pendingCalls(local, fetchedAt).filter(
    (call) =>
      String(call.tsoid) === String(mieId) &&
      String(call.doctorid) === String(doctorId) &&
      (!kind ||
        String(call.institution_call_type ?? '').toLowerCase() === kind.toLowerCase()),
  );

  // Nothing local to add: hand back the server response untouched.
  if (extra.length === 0) return server;

  const base: DoctorCallSummary = server?.summary ?? {
    totalCalls: 0,
    byKind: { chamber: 0, group: 0, parking: 0 },
    durationSeconds: 0,
    slidesShown: 0,
    slidesTotal: 0,
    samplesProvided: 0,
    brands: [],
    skus: [],
    brandTimes: [],
    skuTimes: [],
  };

  const byKind = { ...base.byKind };
  const brandNames = new Set(base.brands);
  const skuNames = new Set(base.skus);
  const brandSeconds = new Map((base.brandTimes ?? []).map((e) => [e.name, e.seconds]));
  const skuSeconds = new Map((base.skuTimes ?? []).map((e) => [e.name, e.seconds]));

  let { durationSeconds, slidesShown, slidesTotal, samplesProvided } = base;
  let lastVisit = base.lastVisit ?? null;

  for (const call of extra) {
    const kindKey = String(call.institution_call_type ?? '').toLowerCase();
    if (kindKey === 'chamber' || kindKey === 'group' || kindKey === 'parking') {
      byKind[kindKey] += 1;
    }

    durationSeconds += Number(call.total_call_time_seconds) || 0;
    slidesShown += Number(call.shown_slides_count) || 0;
    slidesTotal += Number(call.total_slides_count) || 0;
    if (call.sample_provided) samplesProvided += 1;

    namesOf(call.brand).forEach((name) => brandNames.add(name));
    namesOf(call.sku).forEach((name) => skuNames.add(name));
    addSeconds(brandSeconds, secondsMap(call.brand_slide_time));
    addSeconds(skuSeconds, secondsMap(call.sku_slide_time));

    const date = isoDate(callDate(call));
    if (!lastVisit || date > lastVisit) lastVisit = date;
  }

  const totalCalls = base.totalCalls + extra.length;
  const visitsDone = (base.visitsDone ?? base.totalCalls) + extra.length;
  const maxVisits = base.maxVisits ?? null;

  return {
    success: true,
    summary: {
      ...base,
      totalCalls,
      byKind,
      durationSeconds,
      slidesShown,
      slidesTotal,
      samplesProvided,
      brands: [...brandNames],
      skus: [...skuNames],
      brandTimes: sortedEntries(brandSeconds),
      skuTimes: sortedEntries(skuSeconds),
      visitsDone,
      remainingVisits:
        maxVisits != null ? Math.max(maxVisits - visitsDone, 0) : base.remainingVisits,
      lastVisit,
    },
    calls: [
      ...extra.map(toDoctorCallRecord),
      ...(server?.calls ?? []),
    ].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/**
 * Fold this device's calls into the doctor rows, so VisitCount / LastVisit and
 * the per-kind split match what the server would return. This is what makes the
 * Call Reporting list, the Doctor List, the coverage card and the Analytics
 * "Calls Made" figure correct offline.
 */
export function mergeDoctorRows(
  rows: DoctorDataRow[],
  local: LocalCall[],
  fetchedAt: number,
): DoctorDataRow[] {
  const extra = pendingCalls(local, fetchedAt);
  if (extra.length === 0) return rows;

  interface Tally {
    calls: number;
    chamber: number;
    group: number;
    parking: number;
    lastVisit: string;
  }
  const byDoctor = new Map<string, Tally>();

  for (const call of extra) {
    const id = String(call.doctorid ?? '');
    if (!id) continue;

    const tally = byDoctor.get(id) ?? {
      calls: 0,
      chamber: 0,
      group: 0,
      parking: 0,
      lastVisit: '',
    };
    tally.calls += 1;

    const kind = String(call.institution_call_type ?? '').toLowerCase();
    if (kind === 'chamber' || kind === 'group' || kind === 'parking') {
      tally[kind] += 1;
    }

    const date = isoDate(callDate(call));
    if (date > tally.lastVisit) tally.lastVisit = date;

    byDoctor.set(id, tally);
  }

  return rows.map((row) => {
    const tally = byDoctor.get(String(row.DOCTORID ?? ''));
    if (!tally) return row;

    const maxVisits = row.MaxVisitCount ?? null;
    const raw = (row.VisitCount ?? 0) + tally.calls;
    // The server caps the stored count at the quota; match it so an extra call
    // reads as "quota met", not 5 of 4.
    const visitCount = maxVisits ? Math.min(raw, maxVisits) : raw;

    return {
      ...row,
      VisitCount: visitCount,
      VisitStatus:
        maxVisits == null
          ? row.VisitStatus
          : raw >= maxVisits
            ? 'completed'
            : 'in_progress',
      VisitsChamber: (row.VisitsChamber ?? 0) + tally.chamber,
      VisitsGroup: (row.VisitsGroup ?? 0) + tally.group,
      VisitsParking: (row.VisitsParking ?? 0) + tally.parking,
      LastVisit:
        !row.LastVisit || tally.lastVisit > row.LastVisit
          ? tally.lastVisit
          : row.LastVisit,
    };
  });
}

/**
 * The most recent call notes for a doctor, preferring whichever is newer between
 * the server's answer and this device's own calls.
 *
 * Not time-filtered: the previous call is whenever it happened. A local call
 * only wins if it is actually more recent, so a synced note is never replaced by
 * an older one still sitting in the ledger.
 */
/**
 * The note's content, used to recognise a call this device recorded in the
 * server's copy of it. The ledger keeps a call after it uploads, so without
 * this every synced note would be listed twice — once from each source.
 *
 * Two blank calls on the same day collide, so an unsynced one is dropped as a
 * duplicate of a different blank call. That is the safe direction to be wrong
 * in: the call is still counted everywhere else, and a phantom entry saying
 * nothing is worse than a missing one.
 */
function noteSignature(note: {
  date: string;
  feedback?: string | null;
  feedbackComment?: string | null;
}): string {
  return [
    note.date,
    (note.feedback ?? '').trim(),
    (note.feedbackComment ?? '').trim(),
  ].join('|');
}

export function mergeCallNotes(
  server: CallNote[],
  local: LocalCall[],
  mieId: string | undefined,
  doctorId: string | undefined,
): CallNote[] {
  if (!mieId || !doctorId) return server;

  const seen = new Set(server.map(noteSignature));
  const merged = [...server];

  for (const { call } of local) {
    if (call.call_outcome !== 'completed') continue;
    if (String(call.tsoid) !== String(mieId)) continue;
    if (String(call.doctorid) !== String(doctorId)) continue;

    // A call with nothing written is still a call made, and is listed as one.
    const comment = (call.feedback_comment ?? '').trim();
    const chips = (call.feedback ?? '').trim();

    const note: CallNote = {
      id: `local-${call.client_call_id}`,
      date: isoDate(callDate(call)),
      feedback: chips || null,
      feedbackComment: comment || null,
    };

    const signature = noteSignature(note);
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(note);
  }

  // Newest first, the order the endpoint returns and the card renders.
  return merged.sort((a, b) => b.date.localeCompare(a.date));
}

/** Doctors finished for the month, including calls only this device knows about. */
export function mergeCompletedDoctorIds(
  server: string[] | undefined,
  local: LocalCall[],
  mieId: string | undefined,
  fetchedAt: number,
): string[] | undefined {
  if (!server && local.length === 0) return server;

  const extra = pendingCalls(local, fetchedAt).filter(
    (call) => !mieId || String(call.tsoid) === String(mieId),
  );
  if (extra.length === 0) return server;

  const ids = new Set(server ?? []);
  for (const call of extra) {
    const id = String(call.doctorid ?? '');
    if (id) ids.add(id);
  }
  return [...ids];
}

/** This month's call count, including calls not yet uploaded. */
export function mergeMonthlyTotals(
  server: MonthlyCallTotals | undefined,
  local: LocalCall[],
  mieId: string | undefined,
  fetchedAt: number,
  period?: LocalPeriod,
): MonthlyCallTotals | undefined {
  const extra = pendingCalls(local, fetchedAt, period).filter(
    (call) => !mieId || String(call.tsoid) === String(mieId),
  );
  if (!server && extra.length === 0) return server;

  // Slide time from the same calls, so the average stays over exactly the calls
  // counted above.
  const extraSeconds = extra.reduce(
    (total, call) => total + (Number(call.slides_total_time_seconds) || 0),
    0,
  );

  // Union rather than sum: a doctor this device called who the server already
  // counted must not be covered twice.
  const doctorIds = new Set(server?.thisMonthDoctorIds ?? []);
  for (const call of extra) {
    const id = String(call.doctorid ?? '');
    if (id) doctorIds.add(id);
  }

  return {
    // Spreading keeps the period spans the server labelled the figures with.
    ...server,
    thisMonth: (server?.thisMonth ?? 0) + extra.length,
    thisMonthSeconds: (server?.thisMonthSeconds ?? 0) + extraSeconds,
    thisMonthDoctorIds: [...doctorIds],
    // The earlier span is settled — nothing local can change it.
    previousMonth: server?.previousMonth ?? 0,
    previousMonthSeconds: server?.previousMonthSeconds ?? 0,
    // The plan is the server's to state. With no response yet there is no
    // target to divide by, and the cards show a 0 denominator rather than
    // inventing one.
    plannedCalls: server?.plannedCalls ?? 0,
    assignedDoctors: server?.assignedDoctors ?? 0,
  };
}

/**
 * Average slide seconds per call, by specialty and by brand — the server's
 * engagement breakdown with this device's calls folded in. Averages are merged
 * by weight (server avg × its call count + local seconds) so the result matches
 * what a recount on the server would produce.
 */
export function mergeEngagement(
  server: EngagementBreakdown | undefined,
  local: LocalCall[],
  mieId: string | undefined,
  fetchedAt: number,
  period?: LocalPeriod,
): EngagementBreakdown | undefined {
  const extra = pendingCalls(local, fetchedAt, period).filter(
    (call) => !mieId || String(call.tsoid) === String(mieId),
  );
  if (!server && extra.length === 0) return server;

  const bySpecialty = new Map<string, { seconds: number; calls: number }>();
  const byBrand = new Map<string, { seconds: number; calls: number }>();

  const seed = (target: typeof bySpecialty, slices: EngagementSlice[] = []) => {
    for (const slice of slices) {
      target.set(slice.name, {
        // Back out the total from the average the server reported.
        seconds: slice.seconds * slice.calls,
        calls: slice.calls,
      });
    }
  };
  seed(bySpecialty, server?.bySpecialty);
  seed(byBrand, server?.byBrand);

  const add = (
    target: typeof bySpecialty,
    name: string,
    seconds: number,
    calls: number,
  ) => {
    const key = name.trim();
    if (!key) return;
    const current = target.get(key) ?? { seconds: 0, calls: 0 };
    target.set(key, {
      seconds: current.seconds + seconds,
      calls: current.calls + calls,
    });
  };

  for (const call of extra) {
    const slideSeconds = Number(call.slides_total_time_seconds) || 0;
    add(bySpecialty, String(call.doctor_specialty ?? ''), slideSeconds, 1);

    for (const [brand, seconds] of secondsMap(call.brand_slide_time)) {
      add(byBrand, brand, seconds, 1);
    }
  }

  const toSlices = (target: typeof bySpecialty): EngagementSlice[] =>
    [...target.entries()]
      .map(([name, { seconds, calls }]) => ({
        name,
        seconds: calls > 0 ? Math.round(seconds / calls) : 0,
        calls,
      }))
      .filter((slice) => slice.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);

  return { bySpecialty: toSlices(bySpecialty), byBrand: toSlices(byBrand) };
}

/** One entry of a call's slide_time_detail, once it has been read defensively. */
interface LocalSlideTime {
  url: string;
  brand: string;
  sku: string;
  order: number;
  seconds: number;
}

/**
 * A call's slide_time_detail as entries, ignoring anything malformed.
 *
 * The column is jsonb and typed `unknown` on the client, and a call queued by
 * an older build of the app carries no such array at all — so every field is
 * checked rather than assumed.
 */
function slideTimes(value: unknown): LocalSlideTime[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        url: String(row.url ?? '').trim(),
        brand: String(row.brand ?? '').trim(),
        sku: String(row.sku ?? '').trim(),
        order: Number(row.order) || 0,
        seconds: Number(row.seconds) || 0,
      };
    })
    .filter((entry) => entry.url !== '' && entry.seconds > 0);
}

/**
 * Per-slide times with this device's un-uploaded calls folded in — the same job
 * `mergeEngagement` does for the brand and specialty charts, so all three read
 * from the same set of calls and cannot disagree about a call made offline.
 *
 * Averages are merged by weight (the server's average × the calls behind it,
 * plus the local seconds) so the result matches what a recount on the server
 * would produce once the calls land.
 *
 * The bar LABELS are recomputed from scratch afterwards rather than kept from
 * the server: a local call can introduce a second image of a SKU the server
 * only ever saw once, and that slide's name has to change from "EMSYN MET
 * 500MG" to "EMSYN MET 500MG 1" and "... 2" for the two bars to be tellable
 * apart.
 */
export function mergeSlideEngagement(
  server: SlideEngagementBreakdown | undefined,
  local: LocalCall[],
  mieId: string | undefined,
  fetchedAt: number,
  period?: LocalPeriod,
): SlideEngagementBreakdown | undefined {
  const extra = pendingCalls(local, fetchedAt, period).filter(
    (call) => !mieId || String(call.tsoid) === String(mieId),
  );
  if (!server && extra.length === 0) return server;

  /** specialty → slide url → running totals. */
  const bySpecialty = new Map<
    string,
    Map<string, Omit<SlideEngagementSlide, 'label'>>
  >();

  const slotFor = (specialty: string, url: string) => {
    const name = specialty.trim() || 'Unknown';
    let slides = bySpecialty.get(name);
    if (!slides) {
      slides = new Map();
      bySpecialty.set(name, slides);
    }
    return { slides, existing: slides.get(url) };
  };

  for (const group of server?.bySpecialty ?? []) {
    // Entered even with no slides: the server sends EVERY specialty the rep
    // carries so each one gets a button, and dropping the empty ones here
    // would take those buttons away again the moment a local call exists.
    slotFor(group.name, '');
    for (const slide of group.slides) {
      const { slides } = slotFor(group.name, slide.url);
      slides.set(slide.url, {
        url: slide.url,
        brand: slide.brand,
        sku: slide.sku,
        order: slide.order,
        // Back the total out of the average, so local seconds can be added to
        // it and the average retaken over the combined call count.
        totalSeconds: slide.seconds * slide.calls,
        seconds: 0,
        calls: slide.calls,
      });
    }
  }

  for (const call of extra) {
    const specialty = String(call.doctor_specialty ?? '');
    for (const entry of slideTimes(call.slide_time_detail)) {
      const { slides, existing } = slotFor(specialty, entry.url);
      slides.set(entry.url, {
        url: entry.url,
        // The server's names win where it has them: they came from the same
        // recording and a local call adds nothing but another reading.
        brand: existing?.brand || entry.brand,
        sku: existing?.sku || entry.sku,
        // Its earliest seen position, matching how the server picks one.
        order:
          existing && existing.order > 0
            ? Math.min(existing.order, entry.order || existing.order)
            : entry.order,
        totalSeconds: (existing?.totalSeconds ?? 0) + entry.seconds,
        seconds: 0,
        calls: (existing?.calls ?? 0) + 1,
      });
    }
  }

  const groups = [...bySpecialty.entries()]
    .map(([name, slides]) => {
      const list = [...slides.values()]
        .map((slide) => ({
          ...slide,
          totalSeconds: Math.round(slide.totalSeconds),
          seconds:
            slide.calls > 0 ? Math.round(slide.totalSeconds / slide.calls) : 0,
        }))
        .filter((slide) => slide.seconds > 0)
        // Deck order, as the doctor saw them.
        .sort((a, b) => a.order - b.order || a.url.localeCompare(b.url));

      return {
        name,
        slides: labelSlides(list),
        calls: list.reduce((most, slide) => Math.max(most, slide.calls), 0),
        totalSeconds: list.reduce((sum, slide) => sum + slide.totalSeconds, 0),
      };
    })
    // Empty specialties are KEPT — they are the ones whose answer is "you
    // detailed nobody here", which the chart states rather than hides.
    .sort(
      (a, b) => b.totalSeconds - a.totalSeconds || a.name.localeCompare(b.name),
    );

  return { bySpecialty: groups };
}

/**
 * Name each bar, the way the backend does — the SKU, or the brand for a
 * BRAND-WISE row that has no SKU.
 *
 * Deliberately NOT numbered: `order` already carries the slide's position in
 * the deck and the chart shows that in front, so numbering the images within
 * their own run as well would put two competing scales on one axis.
 */
function labelSlides(
  slides: Omit<SlideEngagementSlide, 'label'>[],
): SlideEngagementSlide[] {
  return slides.map((slide) => ({
    ...slide,
    label: slide.sku || slide.brand || 'Slide',
  }));
}
