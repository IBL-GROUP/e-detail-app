---
id: SPEC-DOMAIN-CALLS
title: Doctors and Call Reporting (e-Detailing)
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Doctors and Call Reporting (e-Detailing)

> Reverse-engineered from the code at commit `e4f6eda`. Where the User Manual (`USER_MANUAL.md`)
> states the intent, the row is `Implemented`; behaviour seen only in code is `Unconfirmed`.

## 1. Overview

The core of the app. A rep works through their planned doctors. For each visit they mark
ARRIVED (GPS is captured), start a call and present the slide deck chosen for that doctor
(or specialty), then fill a short Call Summary. A call can also be cancelled with a reason.
Every call is saved on the phone first and uploaded later, so the whole flow works without
signal. Visit counts against each doctor's monthly class quota drive the lists, filters and
progress circles. The Doctors card shows the same book read-only.

## 2. Goals and Scope

**In scope:**
- The planned doctor list (e-Detailing tab), the Doctor List (Doctors card) and doctor detail
- Arrival / GPS capture
- Call types (Chamber, Walking, Group)
- The call screen and slide timing
- The Call Summary, Call Report and cancellation
- The call outbox, local ledger and merge, and the call parts of Sync Details

**Out of scope:**
- Downloading doctors and decks: see [sync.md](sync.md)
- Analytics screens: see [analytics.md](analytics.md)
- Doctor profiles: see [doctor-info.md](doctor-info.md)

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Makes and records calls. Needs `E_DETAILING` to see the e-Detailing tab and card, and `DOCTORS` for the Doctor List. |
| Doctor | Subject of a call. Has a class (A1…A4) for this rep, which sets the monthly visit quota. |
| Manager (RM/SM/HOS/NSM) | May join a call. Recorded as a joint call, not as a separate call type. |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CALL-FR-001 | The e-Detailing tab lists the rep's planned doctors. The list is fetched in one page of up to 500, cached, and seeded from the bulk planned-list download when the cache is empty. Search matches name or specialty on the device; the list shows 30 at a time. | Implemented | `views/planned-calls/index.tsx`, `api/doctor.ts`, `lib/offline/plannedBulk.ts` | CALL-TC-001 |
| CALL-FR-002 | Before a call the rep picks a call type: Chamber, Group or Walking. Chamber is the default; Joint Call is hidden. | Implemented | `views/planned-calls/CallKindSelector.tsx`, `views/planned-calls/callTypes.ts` | CALL-TC-002 |
| CALL-FR-003 | The list can be filtered. The visit filter offers All / Visited / Unvisited / Completed (All / Completed only for Group). The class filter appears when the book has 2 or more classes and excludes `-`. Completed doctors sort last. The badge shows outstanding/total. | Implemented | `components/ui/VisitFilter.tsx`, `components/ui/ClassFilter.tsx`, `views/planned-calls/index.tsx` | CALL-TC-001 |
| CALL-FR-004 | Each doctor card shows initials, specialty, class (when a quota exists), last visit, and one circle per required monthly visit (done or owed). | Implemented | `views/planned-calls/DoctorCard.tsx`, `views/planned-calls/VisitProgress.tsx` | CALL-TC-001 |
| CALL-FR-005 | Doctor detail shows City, Last Visit, Doctor Class, PMDC and every previous call note (newest first). For a doctor still owing calls it offers ARRIVED, START DOCTOR CALL and CANCEL CALL. Opened from the Doctor List it is view-only. | Implemented | `views/planned-calls/doctor-detail/index.tsx`, `app/(tabs)/doctor/[id].tsx` | CALL-TC-003 |
| CALL-FR-006 | ARRIVED captures the rep's GPS position and address. START and CANCEL are enabled only once the arrival has coordinates. Tapping ARRIVED again withdraws it. If no position can be obtained, the arrival is withdrawn ("no location, no call"). | Implemented | `lib/location/useArrival.ts`, `lib/location/captureArrival.ts`, `views/planned-calls/doctor-detail/ArrivedButton.tsx` | CALL-TC-003, CALL-TC-004 |
| CALL-FR-007 | Leaving doctor detail (or the Group panel) after ARRIVED without starting or cancelling records a cancelled call with reason "Walked away without cancelling". | Implemented | `views/planned-calls/recordCancelledCall.ts`, `lib/location/useArrival.ts` | CALL-TC-005 |
| CALL-FR-008 | A call can start only when its deck is on the device. The deck is forcing content for the doctor (Chamber/Walking) or the specialty (Group). With no deck the app explains why and stays put: content not synced ("connect and sync") or no content assigned ("contact your manager"). | Implemented | `views/planned-calls/usePreloadCallDeck.ts`, `api/content.ts` | CALL-TC-006 |
| CALL-FR-009 | The call screen shows the deck. The rep swipes or taps dots; the screen shows "Slide X/Y" and the brand/SKU caption; video slides play only while on screen; images fall back to the server copy if the device copy fails. Back navigation is locked during a call. | Implemented | `views/planned-calls/call-screen/index.tsx`, `views/planned-calls/call-screen/SlideViewer.tsx`, `views/planned-calls/call-screen/SlideCard.tsx`, `hooks/use-lock-back.ts` | CALL-TC-007 |
| CALL-FR-010 | Close opens the Call Summary. It shows duration and slides viewed/total, then: joint call; samples provided; quick-feedback chips; free-text comment. Group calls also require choosing the doctors present. Cancel returns to the call. | Implemented | `views/planned-calls/call-screen/CallSummaryModal.tsx` | CALL-TC-007, CALL-TC-008 |
| CALL-FR-011 | Submit records the call as completed and opens the Call Report. The report shows duration, slides viewed (% completion), call details, time per brand, SKU and slide, and post-call feedback. Completed doctors open a monthly summary for the selected call type. | Implemented | `views/planned-calls/call-screen/index.tsx`, `views/planned-calls/call-analytics/index.tsx`, `views/planned-calls/call-analytics/MonthlyCallSummary.tsx` | CALL-TC-007 |
| CALL-FR-012 | Cancel Call asks for a reason; "Other" requires a note. It records a cancelled call and returns to the list. | Implemented | `views/planned-calls/doctor-detail/CancelCallModal.tsx`, `views/planned-calls/recordCancelledCall.ts` | CALL-TC-009 |
| CALL-FR-013 | Group calls follow this sequence. The rep picks a specialty (searchable when more than 6), then arrives and starts. Slides come from that specialty. At Submit the rep ticks the doctors present, chosen from planned doctors of that specialty who still owe a call. Each ticked doctor gets a completed call record. | Implemented | `views/planned-calls/InstitutionCallPanel.tsx`, `views/planned-calls/call-screen/index.tsx` | CALL-TC-008 |
| CALL-FR-014 | The Doctors card opens a read-only Doctor List of the planned book. It has class and visit filters, search by name or specialty, a "{completed} of {total} complete this month" header, and opens view-only doctor detail. | Implemented | `views/doctor-list/index.tsx`, `views/doctor-list/DoctorListCard.tsx` | CALL-TC-010 |
| CALL-FR-015 | Every call record (started, completed, cancelled) is written on the device first: to the outbox queue, and to the local ledger. It is uploaded in the background. No screen waits on the network. | Implemented | `lib/offline/outbox.ts`, `lib/offline/callLedger.ts`, `providers/OutboxProvider.tsx` | CALL-TC-011 |
| CALL-FR-016 | Completed calls on the device are added to the figures the server returns. These are calls not yet uploaded, or uploaded after those figures were fetched. They count in visit counts, circles, completed lists, notes, the doctor summary and Analytics, so figures update immediately offline. | Implemented | `lib/offline/localCallModels.ts`, `lib/offline/useLocalCalls.ts`, `api/calls.ts`, `api/doctor.ts` | CALL-TC-011 |
| CALL-FR-017 | Settings › Sync Details lists the calls waiting to upload, each marked Pending or Rejected. Retry re-queues a rejected call. | Implemented | `views/settings/SyncDetailsModal.tsx`, `lib/offline/useSyncBacklog.ts` | CALL-TC-012 |
| CALL-FR-018 | An Unplanned Calls screen (team doctor pool) exists, but it has no tab and is reached only from the call flow. | Unconfirmed | `views/unplanned-calls/index.tsx`, `app/(tabs)/_layout.tsx` | CALL-TC-013 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CALL-BR-001 | An arrival is "within vicinity" when the rep is within 50 m of the doctor's day or evening clinic, whichever is nearer. The distance is recorded. An out-of-vicinity call is flagged, never blocked. A coordinate of 0 counts as missing. | Implemented | `lib/location/distance.ts`, `views/planned-calls/call-screen/index.tsx` | CALL-TC-004 |
| CALL-BR-002 | GPS capture tries these in order: (1) reuse a fix ≤ 2 min old and ≤ 200 m accuracy; (2) wait up to 30 s for a fresh fix, accepting ≤ 100 m at first and ≤ 200 m after 4 s; (3) use the last-known fix ≤ 10 min old; (4) fail with `permission_denied`, `services_off` or `no_fix`, each with its own message. The address is reverse-geocoded only when online (2 s cap). | Unconfirmed | `lib/location/captureArrival.ts` | CALL-TC-004 |
| CALL-BR-003 | The monthly visit quota comes from the server per doctor class (`MaxVisitCount`; a code comment says A1:1 … A4:4). The client does not define it. A doctor is complete for the month when `VisitCount ≥ MaxVisitCount`. With no quota, the server's completed-ids list decides. | Implemented | `views/planned-calls/index.tsx`, `views/planned-calls/mapDoctor.ts` | CALL-TC-001 |
| CALL-BR-004 | Visited means at least one visit and not complete; Unvisited means no visits and not complete. Completed for a call type means the quota is met **and** at least one call of that type exists. | Unconfirmed | `components/ui/VisitFilter.tsx`, `views/planned-calls/index.tsx` | CALL-TC-001 |
| CALL-BR-005 | Call types are stored as `chamber`, `parking` (labelled Walking), `group` and `join` (labelled Joint Call). The legacy stored value `walking` counts as `parking`. Chamber and Walking behave identically for the rep. | Implemented | `views/planned-calls/callTypes.ts` | CALL-TC-002 |
| CALL-BR-006 | Cancel reasons: Doctor not available; Doctor busy — no time; Clinic closed; Doctor refused to meet; Waiting time too long; Wrong / changed clinic timing; Personal emergency; Other (note required). The stored reason is "Reason — note", or just the reason; for Other it is the note alone. | Implemented | `views/planned-calls/doctor-detail/CancelCallModal.tsx` | CALL-TC-009 |
| CALL-BR-007 | Quick feedback options (multi-select): Interested, Need Follow-up, Asked for Samples, Price Concern, Competitor Mentioned, Next Visit Planned, Prescribing Other Brands, Plan Camp, Requested for Activity. | Implemented | `views/planned-calls/call-screen/CallSummaryModal.tsx` | CALL-TC-007 |
| CALL-BR-008 | Joint call options are No / RM / SM / HOS / NSM; the default is No. "No" excludes the roles, and roles can be combined. `join_call` stores the chosen roles. | Implemented | `views/planned-calls/call-screen/CallSummaryModal.tsx`, `views/planned-calls/call-screen/index.tsx` | CALL-TC-007 |
| CALL-BR-009 | Samples Provided is a single choice: "None" or one of the team's SKUs. `sample_provided` is true unless "None" is chosen. | Implemented | `views/planned-calls/call-screen/CallSummaryModal.tsx`, `api/sku.ts` | CALL-TC-007 |
| CALL-BR-010 | Each slide has a minimum time of max(1, duration) seconds, where duration is the first number in the deck's `duration` value (default 10 s). Time on each slide is measured and recorded. The rep may close the call at any time; the minimum is not enforced. | Unconfirmed | `views/planned-calls/call-screen/SlideViewer.tsx`, `api/content.ts` | CALL-TC-007 |
| CALL-BR-011 | Slides viewed = the larger of slides that met their minimum and the furthest slide reached. It never decreases during a call. | Unconfirmed | `views/planned-calls/call-screen/SlideViewer.tsx`, `views/planned-calls/call-screen/index.tsx` | CALL-TC-007 |
| CALL-BR-012 | The Group doctor picker excludes doctors whose monthly quota is already met. Unclassified doctors stay in. Doctors are de-duplicated by name. | Unconfirmed | `views/planned-calls/call-screen/index.tsx` | CALL-TC-008 |
| CALL-BR-013 | A completed or cancelled record carries `doctorid` only when the doctor id is numeric. A completed call for a non-numeric id is not recorded. | Unconfirmed | `views/planned-calls/call-screen/index.tsx`, `views/planned-calls/doctor-detail/index.tsx` | CALL-TC-013 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CALL-DATA-001 | A call record is a `CallTrackingInput` (schema in [openapi.json](../api/openapi.json)). It is keyed by a client-generated `client_call_id`; the server upserts on that id. | Implemented | `api/calls.ts` | CALL-TC-011 |
| CALL-DATA-002 | Lifecycle: `started`, written when the call screen has loaded its deck (`call_start_time` = screen open time). Then `completed`, an upsert on the same `client_call_id` at Submit. `cancelled` gets its own `client_call_id` and never has a `started` phase. Locally, `completed` is never downgraded. | Implemented | `views/planned-calls/call-screen/index.tsx`, `views/planned-calls/recordCancelledCall.ts`, `lib/offline/callLedger.ts` | CALL-TC-011 |
| CALL-DATA-003 | Native storage is SQLite `e-detail-outbox.db`. Table `call_outbox` holds `client_id`, `payload`, `status` (pending\|failed), `attempts`, `last_error` and `created_at`, one row per phase. Table `call_ledger` holds `client_call_id`, `payload`, `recorded_at` and `synced_at`; synced rows are pruned after 90 days. Web uses `localStorage` keys `e_detail_call_outbox` and `e_detail_call_ledger` (development only). | Implemented | `lib/offline/outboxStore.ts`, `lib/offline/callLedgerStore.ts`, `lib/offline/outboxStore.web.ts`, `lib/offline/callLedgerStore.web.ts` | CALL-TC-012 |

## 7. API and Interface Contracts

Operations `postCallsBatch`, `getCompletedDoctorIds`, `getCallNotes`, `getDoctorCallSummary`,
`getPlannedDoctors`, `getDoctors`, `getPlannedAll`, `getForcingContent` and `getTeamSkus` in
[openapi.json](../api/openapi.json).

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CALL-API-001 | Queued calls upload through `POST /calls/batch`, at most 50 per request, oldest first. The server answers per item, and partial success is allowed. | Implemented | `lib/offline/outbox.ts`, `api/calls.ts` | CALL-TC-011 |
| CALL-API-002 | Retry policy. A per-item 4xx counts as a rejection, and after 5 rejections the row is removed from the queue. A 5xx, a missing `status` (older backend) or a transport failure keeps the row indefinitely without counting. There is no backoff. A flush runs after each new record, on app start, on reconnect, when a server token becomes available, and on manual Sync. Only one flush runs at a time. | Implemented | `lib/offline/outbox.ts`, `providers/OutboxProvider.tsx` | CALL-TC-012 |
| CALL-API-003 | After a successful upload the app refreshes the cached doctor summary, completed ids, monthly totals, engagement and doctor lists. | Implemented | `providers/OutboxProvider.tsx` | CALL-TC-011 |

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Location permission denied, services off, no fix | Arrival withdrawn; call cannot start | Specific alert per reason (`lib/location/captureArrival.ts`) |
| Deck not on device | Start refused | "Content not available" (connect and sync) |
| No content assigned | Start refused | "No content found … Please contact your manager." |
| Rep profile missing `mieId` at cancel | Cancel refused | "Cannot cancel — Your rep profile is missing. Please sign in again." |
| Upload fails (network/5xx) | Call stays queued, retried on next trigger | Pending count in Settings |
| Upload rejected (4xx) five times | Row removed from queue; ledger shows it as Rejected with Retry | "Rejected" in Sync Details |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CALL-SEC-001 | Location is requested "when in use" and captured only when the rep taps ARRIVED (plus a warm-up watch while the doctor lists are on screen). It is not tracked in the background. | Implemented | `lib/location/captureArrival.ts`, `app.json` | CALL-TC-004 |
| CALL-SEC-002 | A call is attributed by `tsoid` (the signed-in rep's `mieId`). Upload uses the current session's bearer token. | Implemented | `views/planned-calls/call-screen/index.tsx`, `config/axios.ts` | CALL-TC-011 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| CALL-AC-001 | Given a synced phone in airplane mode, when the rep arrives, starts a Chamber call, views slides and submits, then the doctor's circle and count update at once. The call uploads when signal returns. | CALL-FR-006, CALL-FR-015, CALL-FR-016, CALL-API-001 |
| CALL-AC-002 | Given ARRIVED has been tapped, when the rep leaves the doctor without starting or cancelling, then a cancelled call "Walked away without cancelling" is queued. | CALL-FR-007 |
| CALL-AC-003 | Given a Group call for a specialty, when the rep ticks three doctors and submits, then three completed records are queued and those doctors leave the picker once their quota is met. | CALL-FR-013, CALL-BR-012 |

## 11. Testing Requirements

No automated tests exist for this domain. The pure functions are the first candidates: `lib/location/distance.ts`, `views/planned-calls/callTypes.ts` and `lib/offline/localCallModels.ts` (see [migration-plan.md](../process/migration-plan.md)). Manual cases:

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| CALL-TC-001 | Open e-Detailing with a mix of classes and visit counts; use each visit filter and the class filter. | Lists match the BR definitions. Completed doctors are last; circles = quota; badge = outstanding/total. | CALL-FR-001, CALL-FR-003, CALL-FR-004, CALL-BR-003, CALL-BR-004 |
| CALL-TC-002 | Open the Call Type selector. | Chamber (default), Group, Walking. No Joint Call. A Walking call is stored as `parking`. | CALL-FR-002, CALL-BR-005 |
| CALL-TC-003 | Open a doctor owing calls; tap ARRIVED, then ARRIVED again. | Details and notes shown. START/CANCEL are enabled only after coordinates arrive and disabled again on withdraw. | CALL-FR-005, CALL-FR-006 |
| CALL-TC-004 | Arrive (a) at the clinic, (b) 200 m away, (c) with location permission denied. | (a) `arrived_within_vicinity=true`; (b) false, call still allowed; (c) alert, arrival withdrawn. | CALL-FR-006, CALL-BR-001, CALL-BR-002, CALL-SEC-001 |
| CALL-TC-005 | Tap ARRIVED, then press back to the list. | One cancelled record with reason "Walked away without cancelling" is queued. | CALL-FR-007 |
| CALL-TC-006 | Try to start a call (a) before syncing, (b) for a doctor with no assigned content. | (a) "Content not available"; (b) "No content found…". No call screen. | CALL-FR-008 |
| CALL-TC-007 | Complete a Chamber call: swipe all slides, close early, fill the summary with RM joint, a sample, two chips and a comment; submit. | Report shows times per brand/SKU/slide. Payload has `join_call=["RM"]`, `sample_provided=true`, the feedback, and per-slide times. | CALL-FR-009, CALL-FR-010, CALL-FR-011, CALL-BR-007, CALL-BR-008, CALL-BR-009, CALL-BR-010, CALL-BR-011 |
| CALL-TC-008 | Group call: pick a specialty, arrive, start, submit without doctors, then with two doctors. | Submit blocked until a doctor is chosen. Two completed records; picker excludes doctors whose quota is met. | CALL-FR-010, CALL-FR-013, CALL-BR-012 |
| CALL-TC-009 | Cancel with "Other" and no note, then with a note; cancel with "Clinic closed — note". | Other requires a note. Stored reasons follow CALL-BR-006. | CALL-FR-012, CALL-BR-006 |
| CALL-TC-010 | Dashboard › Doctors: filter, search, open a doctor. | Read-only list and detail; no ARRIVED/START buttons. | CALL-FR-014 |
| CALL-TC-011 | Offline: make two calls and a cancellation; go online. | Figures update offline. On reconnect, one `/calls/batch` request uploads all rows and the queue empties. | CALL-FR-015, CALL-FR-016, CALL-DATA-001, CALL-DATA-002, CALL-API-001, CALL-API-003, CALL-SEC-002 |
| CALL-TC-012 | Make the backend answer 422 for one call five times, and 500 for another. | The 422 row leaves the queue and shows Rejected with Retry. The 500 row stays Pending. | CALL-FR-017, CALL-DATA-003, CALL-API-002 |
| CALL-TC-013 | Reach Unplanned Calls through the call flow; try Add Doctor. | Documents current behaviour; see CALL-GAP-009. | CALL-FR-018, CALL-BR-013 |

## 12. Dependencies

- [sync.md](sync.md) for doctors, decks, SKUs and images on the device.
- Backend: `/doctor/*`, `/calls/*`, `/content/forcing`, `/sku`. The server upserts on `client_call_id` and owns the class quotas (`doctor_tso_class_monthly_visit`).
- `expo-location`, `expo-sqlite`, `expo-video`, `react-native-reanimated-carousel`.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| CALL-GAP-001 | The User Manual promises "Nothing is lost", but a call the server rejects (4xx) five times leaves the upload queue. It stays visible as Rejected, with Retry, in Sync Details. Confirm this is acceptable, and whether rejected calls need office follow-up. | Open |
| CALL-GAP-002 | `SlideViewer` computes whether every slide met its minimum time, but the call screen ignores it and lets the rep close at any time. Manual rule 4 says only that time is measured. Confirm: measure only (current), or enforce? | Open |
| CALL-GAP-003 | The ledger is marked synced by `client_call_id`, not by phase. If the `started` row uploads but the `completed` row is later rejected, the call shows as synced, drops out of local merges, and never reaches the server as completed. | Open |
| CALL-GAP-004 | The doctor-row merge (`mergeDoctorRows`) does not filter local calls by rep. The other merges do. On a shared phone, another rep's unsynced calls inflate visit counts. | Open |
| CALL-GAP-005 | Group attendees are resolved by name, so duplicate names collide. If the first attendee does not resolve to a numeric id, the group's `started` row is never completed. | Open |
| CALL-GAP-006 | A call interrupted by an app kill leaves a `started` row with no completion. Confirm how the backend and reports treat open `started` rows. | Open |
| CALL-GAP-007 | A cancellation with reason "Other" stores only the note, losing the "Other" label, so reports cannot tell it from free text. | Open |
| CALL-GAP-008 | Leaving during the GPS wait records a walk-away cancellation with no coordinates, which conflicts with "no location, no call" (CALL-FR-006). | Open |
| CALL-GAP-009 | Unplanned calls carry no call type. Their completion state lasts only for the session. The Add Doctor flow always shows "No content" and does not persist doctors. Is Unplanned retired? | Open |
| CALL-GAP-010 | With the Completed filter on a call type, a doctor whose quota was met by other call types appears in neither Completed nor the to-do list for that type. | Open |
| CALL-GAP-011 | `call_start_time` is the moment the call screen opened, not the moment of ARRIVED or START. Confirm the intended definition for reporting. | Open |
| CALL-GAP-012 | Stale or misleading comments and labels. The completed-ids API is described as "today" but is used monthly. Call-type titles show the raw `parking` instead of "Walking". Comments describe an old Walking flow that picked the doctor at the end. | Open |
| CALL-GAP-013 | Joint Call as a type is hidden "temporarily", and several doctor-detail components are unused (`AddTokenButton`, `ContactInfoCard`, `PlannedCallsCard`, `RecentHistoryCard`). Decide: remove or restore. | Open |
