export type CallType = "planned" | "unplanned";

/**
 * How a call is conducted. The value is stored verbatim in
 * `call_tracking.institution_call_type`.
 *  - 'chamber' → single doctor, picked from the rep's list.
 *  - 'parking' → walking call. Same doctor-by-doctor flow as chamber;
 *                only the mark on the record differs.
 *  - 'group'   → several doctors at once, picked at the End of the call.
 *  - 'join'    → joint call: the rep with a manager or colleague alongside.
 *                Again the chamber flow, again only the mark differs.
 *
 * NOTE ON 'parking'. Its stored value and its label disagree — it is written
 * as 'parking' and shown as "Walking". They are the same kind of call, but the
 * table carries BOTH spellings: the seven oldest rows were written as 'walking'
 * before the rename. Reading them is handled by tallyKeyForStoredKind below,
 * which folds the old spelling into the current one.
 *
 * 'join' is deliberately stored exactly as it is labelled, so the same split
 * cannot happen a second time.
 */
export type CallKind = "chamber" | "parking" | "group" | "join";

/** Every kind, for the runtime checks below. */
const CALL_KINDS: readonly CallKind[] = [
  "chamber",
  "parking",
  "group",
  "join",
];

/**
 * The tally bucket a STORED `institution_call_type` belongs to, or null when
 * it is a value this app does not recognise.
 *
 * Exists because the stored value is not always the current one: 'walking' is
 * the pre-rename spelling of 'parking' and means exactly the same call, so it
 * has to land in the same bucket. Matching only the current spelling left those
 * rows counted by no kind at all, while they still counted toward the visit
 * total — so the split did not add up and nothing on screen said why.
 *
 * The server does the same fold in routes.doctor.js; both sides have to agree
 * or an offline tally will disagree with the one that replaces it after a sync.
 */
export function tallyKeyForStoredKind(value: unknown): CallKind | null {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "walking") return "parking";
  return (CALL_KINDS as readonly string[]).includes(key)
    ? (key as CallKind)
    : null;
}

/** The kinds that run the doctor-list flow (everything except group). */
export function isDoctorListKind(
  kind: CallKind,
): kind is "chamber" | "parking" | "join" {
  return kind !== "group";
}

/**
 * What the rep sees. Deliberately separate from the stored value: every row
 * already in `call_tracking.institution_call_type` carries 'parking', so the
 * wire value stays put and only the wording changes.
 */
export const CALL_KIND_LABELS: Record<CallKind, string> = {
  chamber: "Chamber",
  parking: "Walking",
  group: "Group",
  join: "Join Call",
};
