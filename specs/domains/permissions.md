---
id: SPEC-DOMAIN-PERM
title: Permissions, Dashboard and Navigation
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Permissions, Dashboard and Navigation

> Reverse-engineered from the code at commit `e4f6eda` (feature added in `2871b23`, "whitelist
> dashboard features by roles-permission grants").

## 1. Overview

What a rep can open is granted in the shared roles-permission console. A role grants permission
codes; the app reads them live (`GET /me/permissions`) and shows a dashboard card, and the
matching tab, only when the rep holds that section's VIEW code. Codes are cached per rep so the
same cards show offline. This **hides UI only**: the data endpoints do not check these codes.

## 2. Goals and Scope

**In scope:** permission loading and caching, the dashboard cards, tab visibility, route gating,
and the app shell (tabs, sign-in redirect).
**Out of scope:** server-side authorisation of data endpoints, which is owned by the backend.

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Sees only the features granted to their role. |
| Permission administrator | Grants codes in the roles-permission console (outside this app). |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PERM-FR-001 | Once a rep is known, the app loads that rep's permission codes. It reads the device cache first; when a real session exists it then fetches `GET /me/permissions` (8 s timeout) and replaces the cache. It fetches again on reconnect. | Implemented | `lib/auth/permissions.ts`, `providers/AuthProvider.tsx` | PERM-TC-001 |
| PERM-FR-002 | The dashboard shows one card per granted section, two per row, in this order: Doctors, Portfolio, Content, e-Detailing, Analytics, Patients, Doctor Info. While codes are unknown it shows "Checking your access…". With none granted it shows "You don't have access to any e-Detailing features yet. Please contact your administrator." | Implemented | `views/dashboard/index.tsx`, `views/dashboard/DashboardNavCard.tsx` | PERM-TC-002 |
| PERM-FR-003 | The bottom bar shows Home and Settings always. It shows e-Detailing only with `E_DETAILING` and Analytics only with `ANALYTICS`. All other screens are reached from dashboard cards, with the bottom bar kept visible. | Implemented | `app/(tabs)/_layout.tsx` | PERM-TC-002 |
| PERM-FR-004 | Analytics, the initial tab, is wrapped in a gate. It renders nothing until codes are known and redirects to Home without `ANALYTICS`. | Implemented | `components/PermissionGate.tsx`, `app/(tabs)/analytics.tsx` | PERM-TC-003 |
| PERM-FR-005 | An unauthenticated user is redirected to `/login` once the session has loaded. | Implemented | `app/_layout.tsx` | PERM-TC-004 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PERM-BR-001 | Code format: `ONE_FOR.MOBILE.E_DETAILING_APP.<SECTION>.<ACTION>`, where ACTION is `VIEW` for cards. Sections: `DOCTORS`, `PORTFOLIO`, `CONTENT`, `E_DETAILING`, `ANALYTICS`, `PATIENTS`, `DOCTOR_INFO`. A new card needs its permission created in the console under the same project, module and resource. | Implemented | `lib/auth/permissions.ts`, `views/dashboard/index.tsx` | PERM-TC-002 |
| PERM-BR-002 | Fail closed: with no cache and no fetch, the rep has no codes and sees no cards. A failed fetch keeps the last cached codes. | Implemented | `lib/auth/permissions.ts` | PERM-TC-001 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PERM-DATA-001 | Codes are cached per rep under file-store key `permissions-<userId>` and kept after sign-out. | Implemented | `lib/auth/permissions.ts` | PERM-TC-001 |

## 7. API and Interface Contracts

Operation `getMyPermissions` in [openapi.json](../api/openapi.json).

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Permission fetch fails | Last cached codes kept | — |
| No cache, offline | No cards | "You don't have access to any e-Detailing features yet…" |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PERM-SEC-001 | Permission codes are a UI whitelist only; they are not access control. Any authorisation that matters must be enforced by the backend (see PERM-GAP-001). | Implemented | `lib/auth/permissions.ts` | PERM-TC-003 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| PERM-AC-001 | Given a role granting only DOCTORS and E_DETAILING, when the rep opens the app, then the dashboard shows exactly those two cards, the tab bar shows Home, e-Detailing and Settings, and opening Analytics returns to Home. | PERM-FR-002, PERM-FR-003, PERM-FR-004, PERM-BR-001 |
| PERM-AC-002 | Given a grant is added in the console, when the rep reconnects or reopens the app, then the new card appears without signing in again. | PERM-FR-001 |

## 11. Testing Requirements

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| PERM-TC-001 | Online with grants; then offline with a cache; then a new rep offline with no cache. | Cards match the grants; the cached set is shown offline; no cards for the uncached rep. | PERM-FR-001, PERM-BR-002, PERM-DATA-001 |
| PERM-TC-002 | Grant subsets of sections. | Cards and tabs match PERM-FR-002 and PERM-FR-003 exactly. | PERM-FR-002, PERM-FR-003, PERM-BR-001 |
| PERM-TC-003 | Without ANALYTICS, open the app (Analytics is the initial tab). | Lands on Home; no flash of Analytics. | PERM-FR-004, PERM-SEC-001 |
| PERM-TC-004 | Launch signed out. | Sign-in screen. | PERM-FR-005 |

## 12. Dependencies

- roles-permission backend: `GET /me/permissions`, and console configuration of the seven sections.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| PERM-GAP-001 | Only Analytics has a route gate. Doctors, Portfolio, Content, Patients, Doctor Info and doctor detail can be opened by deep link without the permission, and the data endpoints do not check codes either. Decide whether every gated screen needs `PermissionGate`, and whether the backend should enforce the codes. | Open |
| PERM-GAP-002 | Hidden or placeholder screens remain in the bundle: `explore` (the unmodified Expo template), `ai-trainer` and `faqs` (title only), and `modal`. The dashboard also keeps unused mock cards (performance chart, tutorial video, reminders, pro tip, quick actions). Decide: remove or build. | Open |
| PERM-GAP-003 | The dashboard header shows a hard-coded notification count of 1. | Open |
