---
id: SPEC-DOMAIN-DINFO
title: Doctor Information Gathering (App)
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-12
---

# Doctor Information Gathering (App)

> Reverse-engineered from the code at commit `e4f6eda` (feature commits `b324ceb`, `f075f4b`, `e4f6eda`).
> The feature's authoritative requirements live in the **backend** spec
> FEAT-doctor-info-gathering, whose `DOC-*` IDs the code cites (registered as an external
> prefix; see [CONVENTIONS](../CONVENTIONS.md#2-requirement-identifiers)). That spec is not in
> this repository. The `DINFO-*` rows below record what the **app** does. Each cites the `DOC-*`
> ID it implements where the code says so; the meaning of each `DOC-*` ID is inferred from code
> comments only (DINFO-GAP-001).

## 1. Overview

The rep builds a profile of each assigned doctor, once per doctor. The doctor's identity comes
from the PMDC (medical council) registration. The rep adds personal, professional, practice,
commercial and visiting-card details through a six-step form. Profiles are saved on the phone
first, as an editable draft and then a queued upload, and uploaded when online.

## 2. Goals and Scope

**In scope:** the Doctor Info list, the six-step capture form and its validation, drafts, the
upload queue, the read-only profile view, and adding a missing hospital.
**Out of scope:** server-side validation and storage (backend FEAT-doctor-info-gathering).

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Captures profiles for their assigned doctors. Needs `DOCTOR_INFO`. |
| PMDC registry (via backend) | Source of a doctor's name, father's name, issue date and status. |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| DINFO-FR-001 | The Doctor Info list shows the rep's assigned doctors that have a PMDC number. It has: a "{filled}/{assigned} filled" count and progress bar; All / Pending / Filled filters; search by name, PMDC, city or specialty; unfilled doctors first, then by name; and 30 rows at a time. Each row is tagged Approved, Pending review or Rejected (a profile on the server, by its approval status, DINFO-FR-013), Captured (on the server, status unknown), Waiting to sync, Draft or Pending. Changed on 2026-11-12 at the request of Arslan Fareed ("on mobile App, add a tag approve, pending or rejected on a record"), replacing the single "Captured" tag for profiles on the server; the counts and filters are unchanged (DINFO-BR-016). | Implemented | `views/doctor-profiles/index.tsx`, `views/doctor-profiles/AssignedDoctorCard.tsx`, `api/doctorProfiles.ts` | DINFO-TC-001, DINFO-TC-012 |
| DINFO-FR-002 | Tapping a pending doctor opens the six-step form: PMDC Verification, Personal, Professional, Practice Locations, Commercial & Accessibility, Review & Submit. Tapping a captured doctor opens the profile read-only. A profile is captured once and cannot be edited afterwards. | Implemented | `views/doctor-profiles/DoctorProfileScreen.tsx`, `views/doctor-profiles/ProfileForm.tsx`, `views/doctor-profiles/ProfileDetails.tsx`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-002 |
| DINFO-FR-003 | Step 1 shows the PMDC identity read-only, taken from the assigned list. If any identity field is missing, the app looks it up with `GET /doctor-profiles/pmdc/{pmdc}`. A 404/400 means "PMDC Number not found…"; no network means "Couldn't reach the server to verify this PMDC number…" (cites DOC-FR-010). | Implemented | `views/doctor-profiles/ProfileForm.tsx`, `api/doctorProfiles.ts` | DINFO-TC-002 |
| DINFO-FR-004 | A visiting-card photo is required. On native it is taken with the camera only, with permission requested at the moment of use. Web uses the photo library. | Implemented | `views/doctor-profiles/VisitingCardPicker.tsx` | DINFO-TC-003 |
| DINFO-FR-005 | Errors show only for the current step. Next is blocked while the step has errors. Review lists every step with problems and a Fix button. Save validates everything and jumps to the first step with problems. | Implemented | `views/doctor-profiles/ProfileForm.tsx`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-004 |
| DINFO-FR-006 | The form autosaves a draft per rep and PMDC (450 ms debounce, once the rep has made progress). Reopening the doctor restores the draft. The draft is deleted once the profile is queued. | Implemented | `lib/offline/doctorProfileDrafts.ts`, `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-005 |
| DINFO-FR-007 | Save writes the profile to the device queue first, with `clientUpdatedAt = now`. When online it then uploads at once and reports the result. If the server refuses, the rep sees "Saved on this device, but NOT on the server yet: … It will retry automatically, or open the doctor and tap Retry Upload." | Implemented | `lib/offline/doctorProfileOutbox.ts`, `api/doctorProfiles.ts`, `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-006 |
| DINFO-FR-008 | A profile still waiting to upload shows "Saved on this phone…". If the last upload failed it also shows the error with Retry Upload. Discard Profile removes a local, not-yet-uploaded profile so it can be captured again. | Implemented | `views/doctor-profiles/DoctorProfileScreen.tsx` | DINFO-TC-006 |
| DINFO-FR-009 | Choosing or typing a hospital not in the master list for that city adds it with `POST /doctor-profiles/hospitals`. If that fails, the server adds it when the profile uploads (cites DOC-FR-017, DOC-BR-012). | Implemented | `views/doctor-profiles/formParts.tsx`, `api/doctorProfiles.ts` | DINFO-TC-007 |
| DINFO-FR-011 | Step 4 (Practice Locations) shows one card per practice location, named per DINFO-BR-014 (Primary, Secondary, Location 3 … Location N), where N is the No. of Practice Locations from Step 3 (1–10, DINFO-BR-009). Cards sit side by side in pairs on every screen size, phones included: Primary beside Secondary, Location 3 beside Location 4, and so on; when N is odd the last card keeps the width of one column. Changed on 2026-11-10 at the request of Arslan Fareed, replacing "stacked on every screen size" (product-owner decision of 2026-11-09). Each card asks for the same ten fields as today: speciality, city, hospital, session, fee, avg time, patients per day, OPD timing, best visiting time and appointment system. Cards can be collapsed; a collapsed card's header shows its hospital and speciality. Primary starts open, and Next opens and scrolls to the first card with an error. Decided by the product owner on 2026-11-09. | Implemented | `views/doctor-profiles/ProfileForm.tsx`, `views/doctor-profiles/formParts.tsx`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-009 |
| DINFO-FR-012 | Review & Submit and the read-only profile view list every practice location in order, named per DINFO-BR-014. A profile saved before the N-locations change, or by the Searle app, shows its primary and secondary practice as Primary and Secondary. A profile already saved with more than 10 locations still shows all of them (the cap of DINFO-BR-009 applies to entry only). Average time shows as "{n} min"; a value stored in the admin console's older "{n} Mins" form (e.g. "15 Mins") shows as "15 min", and any other text is shown as it is (decided 2026-11-09). | Implemented | `views/doctor-profiles/ProfileForm.tsx`, `views/doctor-profiles/ProfileDetails.tsx`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-009 |
| DINFO-FR-010 | Opening Doctor Info caches the city, hospital and company master lists (`GET /doctor-profiles/master`, fresh for 60 min) for offline use. Until they load, 18 fallback cities are offered. | Implemented | `views/doctor-profiles/index.tsx`, `api/doctorProfiles.ts`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-007 |
| DINFO-FR-013 | A doctor whose profile is on the server (filled and not waiting to sync) is tagged on the Doctor Info list by the profile's approval status, set by the rep's managers in the admin console (backend DOC-FR-020, DOC-BR-024): `APPROVED` shows "Approved" (green, check-circle icon), `PENDING` shows "Pending review" (amber, clock icon) and `REJECTED` shows "Rejected" (red, cross-circle icon). "Pending review" is deliberately not "Pending", which already means "not yet profiled" (DINFO-FR-001). When the server sends no status (an older server) or an unknown one, the row keeps "Captured". "Waiting to sync", "Draft" and "Pending" are unchanged. Added on 2026-11-12 at the request of Arslan Fareed. | Implemented | `views/doctor-profiles/AssignedDoctorCard.tsx`, `views/doctor-profiles/ApprovalStatus.tsx`, `api/doctorProfiles.ts` | DINFO-TC-012, DINFO-TC-014 |
| DINFO-FR-014 | The read-only profile shows the same approval tag in its header, next to the PMDC chips. A rejected profile also shows a notice under the header: "Rejected by {manager's name}" (or "Rejected by your manager" when the server sends no name), the reason, the manager's comment if any, and "Your manager's team will correct this profile in the console. You don't need to capture it again." An approved profile with a comment shows the comment quietly under the header. A profile pending review shows the tag only. A profile still waiting to upload, or read from an older server, shows no approval tag. Added on 2026-11-12 at the request of Arslan Fareed. | Implemented | `views/doctor-profiles/ProfileDetails.tsx`, `views/doctor-profiles/DoctorProfileScreen.tsx`, `views/doctor-profiles/ApprovalStatus.tsx` | DINFO-TC-013, DINFO-TC-014 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| DINFO-BR-001 | Doctor name format: trim, strip a leading "Dr"/"Dr." (any case), then prefix "DR. " (cites DOC-BR-007). | Implemented | `views/doctor-profiles/profileRules.ts` | DINFO-TC-002 |
| DINFO-BR-002 | PMDC status: `Y` or `ACTIVE` maps to "Active", any other value to "Inactive", and empty stays empty (cites DOC-BR-008). | Implemented | `views/doctor-profiles/profileRules.ts` | DINFO-TC-002 |
| DINFO-BR-003 | PMDC numbers are compared trimmed and upper-cased (cites DOC-BR-006). A valid PMDC matches `^[A-Za-z0-9-]{3,20}$`. | Implemented | `api/doctorProfiles.ts`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-002 |
| DINFO-BR-004 | Required fields: visiting card, religion, gender, digital comfort, practice locations, practice type, innovation adoption, access type, interaction style, Rx status, Rx pattern, pharmacy ownership, cell no and WhatsApp no. Each practice location's required fields are in DINFO-BR-010 (since 2026-11-09; before that, a primary and an optional secondary practice). | Implemented | `views/doctor-profiles/profileRules.ts` | DINFO-TC-004 |
| DINFO-BR-005 | Mobile numbers are stored as 11 digits starting `03`, and WhatsApp mirrors Cell No until edited by hand. Age, fee, average time and patients per day must be non-negative numbers. Input caps: age 3, fee 7, average time 3, patients per day 4 digits. | Unconfirmed | `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-004 |
| DINFO-BR-006 | Other-company prescriber shares need at least one row. Each row needs a unique company (case-insensitive) and a percentage greater than 0, and the total must equal exactly 100% (server re-checks: cites DOC-BR-009). | Implemented | `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/CompanySharesField.tsx` | DINFO-TC-004 |
| DINFO-BR-007 | Option lists are fixed in the app. They cover 20 specialities, religion, gender, digital comfort, practice type, adoption, access, interaction style, Rx status and pattern, pharmacy ownership, session, OPD timings, 48 half-hour visiting slots, and appointment system. | Unconfirmed | `views/doctor-profiles/profileRules.ts` | DINFO-TC-004 |
| DINFO-BR-008 | Changing a location's city clears that location's hospital. (Its former rules, "secondary speciality cannot equal the primary" and "setting practice locations to 1 clears all secondary fields", were replaced on 2026-11-09 by DINFO-BR-012 and DINFO-BR-011.) | Unconfirmed | `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-004 |
| DINFO-BR-009 | No. of Practice Locations is a typed number field (numeric keypad, digits only, leading zeros dropped), not a dropdown. It starts at 1 on a new form and on a restored draft that has no value. It must be a whole number from 1 to 10, typed as at most 2 digits; 0 or a number above 10 shows "Enter a number from 1 to 10.", an emptied field shows "This field is required", and either blocks Next. The placeholder reads "1 to 10". A draft restored with a count above 10 is set to 10; its locations beyond 10 are kept hidden, as in DINFO-BR-011. Step 4 shows that many practice locations (DINFO-FR-011). History: 1–5 option list; typed with no upper limit (product owner, 2026-11-06); maximum of 10 added on 2026-11-10 at the request of Arslan Fareed. The backend stores the value as free text (`practice_locations text`, at most 500 characters) with no range check, so the app is the only place the range is enforced. | Implemented | `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-004 |
| DINFO-BR-010 | Every location requires the fields DINFO-BR-004 requires of the primary practice (speciality, city, hospital, session, avg time, OPD timing, best visiting time, appointment system), and fee and patients per day must be non-negative numbers (DINFO-BR-005). Replaces the primary/secondary wording of DINFO-BR-004 (approved 2026-11-09). | Implemented | `views/doctor-profiles/profileRules.ts` | DINFO-TC-009 |
| DINFO-BR-011 | Changing N: raising it adds empty locations at the end. Lowering it hides the locations beyond N; they stay in the draft, so raising N again brings them back filled, but they are not shown, validated or sent. Replaces "setting practice locations to 1 clears all secondary fields" in DINFO-BR-008 (approved 2026-11-09). | Implemented | `views/doctor-profiles/ProfileForm.tsx`, `views/doctor-profiles/profileRules.ts` | DINFO-TC-009 |
| DINFO-BR-012 | Every location offers the full speciality list. Choosing a speciality at one location never removes it from another location's list. Replaces "secondary speciality cannot equal the primary" in DINFO-BR-008 (approved 2026-11-09). | Implemented | `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-009 |
| DINFO-BR-013 | The same doctor cannot have the same speciality at the same hospital twice. Two locations clash when city, hospital and speciality all match (trimmed, case-insensitive). The same speciality at different hospitals, and different specialities at the same hospital, are allowed. A clash marks the later location's speciality with "{Speciality} is already entered for {Hospital} ({earlier location's name, DINFO-BR-014})." (e.g. "… for Hospital A (Primary).", "… (Location 3)."; wording changed with the names on 2026-11-10) and blocks Next and Save. The message appears as soon as the speciality, city or hospital that causes the clash is chosen, not only on Next (decided by the product owner on 2026-11-09): the card holding it is opened, and the message goes away as soon as the clash is resolved. The server re-checks (backend DOC-BR-020). | Implemented | `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/ProfileForm.tsx` | DINFO-TC-009 |
| DINFO-BR-014 | Practice locations are named by position: the 1st is "Primary", the 2nd is "Secondary", and the k-th from the 3rd on is "Location k". The same names are used on the Step 4 cards, their picker titles (e.g. "Primary · City"), the clash message (DINFO-BR-013), Review & Submit and the read-only profile ("Speciality · Primary"). Only labels change; the data stays an ordered list (DINFO-DATA-003). Decided on 2026-11-10 at the request of Arslan Fareed, replacing "Location 1" / "Location 2". | Implemented | `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/formParts.tsx`, `views/doctor-profiles/ProfileForm.tsx`, `views/doctor-profiles/ProfileDetails.tsx` | DINFO-TC-009, DINFO-TC-011 |
| DINFO-BR-015 | A rejected profile cannot be edited or captured again by the rep: DINFO-FR-002 (captured once, no edit) still applies, and the app offers no edit, discard or recapture for it. A console user with the "Doctor Info" role corrects it, after which the server sets it back to pending review (backend DOC-BR-024). The app only shows the tag and the reason (DINFO-FR-013, DINFO-FR-014). Decided by Arslan Fareed on 2026-11-12. | Implemented | `views/doctor-profiles/DoctorProfileScreen.tsx`, `views/doctor-profiles/ApprovalStatus.tsx` | DINFO-TC-013 |
| DINFO-BR-016 | Coverage is unchanged by approval: the "{filled}/{assigned} filled" count, the progress bar and the All / Pending / Filled filters count every submitted profile, whether it is pending review, approved or rejected. Decided by Arslan Fareed on 2026-11-12. | Implemented | `views/doctor-profiles/index.tsx`, `api/doctorProfiles.ts` | DINFO-TC-012 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| DINFO-DATA-001 | `DoctorProfileInput` = all profile fields (camelCase strings, plus `otherCompanyPrescribers: {company, percent}[]`), `clientLocalId` and `clientUpdatedAt`. The server upserts on (owner, `clientLocalId`) and keeps the latest `clientUpdatedAt` (cites DOC-BR-010). Schema in [openapi.json](../api/openapi.json). | Implemented | `api/doctorProfiles.ts`, `lib/offline/doctorProfileOutbox.ts` | DINFO-TC-006 |
| DINFO-DATA-002 | Queue: SQLite table `doctor_profile_outbox` (native; web: IndexedDB `e-detail-doctor-profiles`). Drafts: file store (web: IndexedDB `e-detail-doctor-profile-drafts`). Visiting-card photos are copied into app storage until uploaded. Synced rows are pruned after 90 days. | Implemented | `lib/offline/doctorProfileOutboxStore.ts`, `lib/offline/doctorProfileOutboxStore.web.ts`, `lib/offline/doctorProfileDrafts.ts` | DINFO-TC-005 |
| DINFO-DATA-003 | The profile payload adds `practiceSites`: an ordered array of N objects `{speciality, city, hospital, session, fee, avgTime, patientsPerDay, opdTiming, bestVisitingTime, appointmentSystem}`, and `practiceLocations` is sent as N. The app also keeps filling the `primary*` and `secondary*` fields from Locations 1 and 2, so a backend without this change still stores those two. Profiles read from the server carry `practiceSites` (backend DOC-BR-022). `CACHE_BUSTER` is bumped. | Implemented | `api/doctorProfiles.ts`, `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/ProfileForm.tsx`, `lib/offline/persister.ts` | DINFO-TC-009 |
| DINFO-DATA-004 | Old data is never dropped: a draft saved before this change has its primary/secondary fields converted to Locations 1 and 2 when restored, and a profile already queued in the old shape uploads unchanged (the backend accepts both shapes, DOC-BR-021). | Implemented | `views/doctor-profiles/profileRules.ts`, `views/doctor-profiles/ProfileForm.tsx`, `lib/offline/doctorProfileOutbox.ts` | DINFO-TC-010 |
| DINFO-DATA-005 | Approval fields read from the server (backend DOC-DATA-006). Each `GET /doctor-profiles/assigned` row carries `approvalStatus` (`PENDING` / `APPROVED` / `REJECTED`, or null when the doctor has no profile on the server), `approvalReason` (set when rejected: one of "PMDC number does not match the doctor", "Practice details incomplete", "Duplicate of an existing profile", "Contact numbers look wrong", "Other") and `approvalNote` (the manager's comment, at most 500 characters). Each `GET /doctor-profiles` row carries `approval: {status, reason, note, decidedBy, decidedByName, decidedAt}`. Older servers omit them: the app treats a missing value as unknown and shows no approval tag. A profile queued on this device and not yet uploaded has no server status, so the list merge clears these fields for it and it shows "Waiting to sync". The app never sends them. `CACHE_BUSTER` is bumped. | Implemented | `api/doctorProfiles.ts`, `views/doctor-profiles/ApprovalStatus.tsx`, `lib/offline/persister.ts` | DINFO-TC-014 |

## 7. API and Interface Contracts

Operations `getDoctorProfiles`, `getAssignedDoctors`, `getProfileMaster`, `lookupPmdc`,
`addHospital`, `postDoctorProfilesBatch` and `uploadVisitingCard` in
[openapi.json](../api/openapi.json).

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| DINFO-API-001 | Upload sends at most 25 profiles per `POST /doctor-profiles/batch` (cites DOC-FR-009). The visiting card is uploaded first (`POST /doctor-profiles/visiting-card`, 120 s); if that fails the row is held. A per-item 4xx counts as a rejection (for example "already profiled from another device", cites DOC-BR-011), and after 5 the row is removed. A 5xx or a network error retries without limit. | Implemented | `lib/offline/doctorProfileOutbox.ts`, `lib/offline/visitingCards.ts` | DINFO-TC-006 |

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Save with invalid fields | Jump to first failing step | "Not saved — "{Step}" has fields to fix. They are marked in red." |
| Server refuses on save | Kept in queue | "Saved on this device, but NOT on the server yet: …" |
| Local write fails | Not saved | "Could not save: … Please try again." |
| Web: card photo lost (`blob:`) | Back to step 1 | "Not saved — the visiting card photo is no longer available. Please capture it again." |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| DINFO-SEC-001 | Screens show only profiles whose `ownerId` is the signed-in rep. | Implemented | `api/doctorProfiles.ts` | DINFO-TC-008 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| DINFO-AC-001 | Given an assigned doctor and no signal, when the rep completes and saves the form, then the doctor shows "Waiting to sync" and counts as filled. When signal returns the profile uploads and shows "Pending review" ("Captured" from a server without the approval change, DINFO-FR-013; changed 2026-11-12). | DINFO-FR-007, DINFO-API-001, DINFO-FR-013 |
| DINFO-AC-002 | Given shares totalling 90%, when the rep saves, then saving is refused with "Percentages must total 100% (currently 90%)." | DINFO-BR-006 |

## 11. Testing Requirements

`views/doctor-profiles/profileRules.ts` is pure and is the first candidate for unit tests. Manual cases:

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| DINFO-TC-001 | Open Doctor Info with some profiles filled; use the filters and search. | Counts, tags, ordering and search as in DINFO-FR-001. | DINFO-FR-001 |
| DINFO-TC-002 | Open a pending doctor with missing identity; online, then offline. | Online: identity filled, name "DR. …", status Active/Inactive. Offline: "Couldn't reach the server…". | DINFO-FR-002, DINFO-FR-003, DINFO-BR-001, DINFO-BR-002, DINFO-BR-003 |
| DINFO-TC-003 | Try Next on step 1 without a card; deny camera permission. | "Capture the visiting card…"; permission alert. | DINFO-FR-004 |
| DINFO-TC-004 | Enter invalid values per rule (10-digit phone, negative fee, shares 60+30, duplicate company, new form shows practice locations 1; enter 0, then 11, then 10). | Each message per `profileRules.ts` (0 and 11 show "Enter a number from 1 to 10." and block Next; a third digit cannot be typed; 10 is accepted); Review lists the failing steps. | DINFO-FR-005, DINFO-BR-004, DINFO-BR-005, DINFO-BR-006, DINFO-BR-007, DINFO-BR-008, DINFO-BR-009 |
| DINFO-TC-005 | Fill to step 3, leave, kill the app, reopen the doctor. | Draft restored at step 3; row tagged Draft. | DINFO-FR-006, DINFO-DATA-002 |
| DINFO-TC-006 | Save offline; then online with the backend returning 4xx; then 5xx. | "Waiting to sync". 4xx: Retry Upload shown and the row removed after 5. 5xx: kept. | DINFO-FR-007, DINFO-FR-008, DINFO-DATA-001, DINFO-API-001 |
| DINFO-TC-007 | Type a new hospital for a city, online and offline. | Online: added to the master list. Offline: kept on the profile and added at upload. | DINFO-FR-009, DINFO-FR-010 |
| DINFO-TC-008 | Rep A saves offline and signs out; rep B signs in. | B's list does not show A's profile. | DINFO-SEC-001 |
| DINFO-TC-009 | Set 4 locations in Step 3. In Step 4 fill all four: Cardiology at Hospital A in Primary, Cardiology at Hospital B in Secondary, Neurology at Hospital A in Location 3, then Cardiology at Hospital A again in Location 4, without pressing Next. Fix it, then lower N to 2, raise it back to 4, and save online. | Step 4 shows four cards named Primary, Secondary, Location 3, Location 4, in two rows of two, each offering all specialities. Location 4 shows "Cardiology is already entered for Hospital A (Primary)." the moment its hospital or speciality is picked, it clears once fixed, and Next is blocked while it shows; Locations 1–3 are accepted. After 4 → 2 → 4 the last two cards come back filled. Review, the saved profile view and the server row all show four locations. | DINFO-FR-011, DINFO-FR-012, DINFO-BR-010, DINFO-BR-011, DINFO-BR-012, DINFO-BR-013, DINFO-BR-014, DINFO-DATA-003 |
| DINFO-TC-011 | On a phone (and a tablet), set N to 3, then 10, in Step 3; open Step 4; collapse and expand cards; open a speciality picker; restore a draft that was saved with N = 12. | Cards in pairs on both devices: Primary beside Secondary, Location 3 alone at one column's width (N = 3); five rows of two (N = 10). Picker title reads e.g. "Secondary · Speciality". The N = 12 draft opens with 10 locations and no error on Step 3. | DINFO-FR-011, DINFO-BR-009, DINFO-BR-014 |
| DINFO-TC-010 | With the old app build, save a draft with two locations and queue another profile offline; install the new build and open both; open a captured profile whose average time is "15 Mins". | The draft shows its two practices as Primary and Secondary; the queued profile uploads and shows two locations; the "15 Mins" profile shows Avg Time "15 min". | DINFO-DATA-004, DINFO-FR-012 |
| DINFO-TC-012 | Against a server with the approval change, open Doctor Info with profiles that are pending review, approved and rejected, one doctor not yet profiled, one with a draft, and one saved offline. Use the filters. | Rows read "Pending review" (amber), "Approved" (green), "Rejected" (red), "Pending", "Draft" and "Waiting to sync". The filled count and the Filled filter include the pending-review, approved and rejected doctors alike. | DINFO-FR-001, DINFO-FR-013, DINFO-BR-016 |
| DINFO-TC-013 | Open a rejected profile with a manager's comment, a rejected one whose decider has no name, an approved one with a comment, and one pending review. | Rejected: red "Rejected" tag in the header; notice "Rejected by {name}" (or "Rejected by your manager"), the reason, the comment and "Your manager's team will correct this profile in the console. You don't need to capture it again."; no edit, discard or recapture is offered. Approved: green tag and the comment in a quiet note. Pending review: amber tag only. | DINFO-FR-014, DINFO-BR-015 |
| DINFO-TC-014 | Against a server without the approval change (no approval fields), open the list and a captured profile. Then save a profile offline and open it. | Server profiles show "Captured" on the list and no approval tag on the profile, with no crash. The offline one shows "Waiting to sync" and no approval tag until it uploads; after upload and refresh it shows "Pending review". | DINFO-FR-013, DINFO-FR-014, DINFO-DATA-005 |

## 12. Dependencies

- Backend FEAT-doctor-info-gathering: `/doctor-profiles/*` endpoints and the `doctors_info` table.
- Backend FEAT-doctor-info-approval (DOC-FR-020, DOC-BR-024, DOC-DATA-006): the approval status, reason and note on profiles, decided in the admin console. Not in this repository (see DINFO-GAP-001).
- Permission `DOCTOR_INFO` in the roles-permission console.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| DINFO-GAP-001 | The backend spec defining DOC-FR-009, DOC-FR-010, DOC-FR-012, DOC-FR-017, DOC-BR-006 to DOC-BR-012 and DOC-DATA-001 is not in this repository; the meanings above are inferred from code comments. Link or vendor that spec so the IDs can be checked. | Open |
| DINFO-GAP-002 | The upload sends every owner's queued profiles under the current rep's token, and the payload carries no owner. On a shared phone, another rep's pending profile would presumably be attributed to the signed-in rep. | Open |
| DINFO-GAP-003 | A profile removed after 5 rejections disappears silently: it is not listed as rejected, its local card file is not deleted, and the doctor shows Pending again. | Open |
| DINFO-GAP-004 | Phone formats differ between domains: profiles store `03XXXXXXXXX`, patients store `+92-3XX-XXXXXXX`. Pasting a `+92…` number into a profile field yields a wrong number. | Open |
| DINFO-GAP-005 | The server's assigned/filled `meta` is ignored and the counts are computed on the device. The search placeholder omits specialty. Usage tracking files Doctor Info screen time as `other`. | Open |
| DINFO-GAP-006 | Profile routes have no permission gate (see PERM-GAP-001). | Open |
| DINFO-GAP-007 | With no upper limit on practice locations, a mistyped large N (for example 50) builds 50 location cards, all required. The product owner chose no maximum on 2026-11-06. Resolved 2026-11-10: capped at 10 (DINFO-BR-009). | Resolved |
