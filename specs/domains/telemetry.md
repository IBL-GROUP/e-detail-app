---
id: SPEC-DOMAIN-TEL
title: Usage Telemetry and Crash Reporting
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Usage Telemetry and Crash Reporting

> Reverse-engineered from the code at commit `e4f6eda`. Reports are viewed in the admin
> console under `/access/app-usage`.

## 1. Overview

The app records how it is used (time open, time per screen, online/offline time, syncs,
sign-ins and sign-outs) and how it fails (JS errors, fatal crashes, unexpected exits). Events
are queued on the device and uploaded in batches when there is a real session and a network.

## 2. Goals and Scope

**In scope:** the event types and fields, the on-device queue, upload, and crash capture.
**Out of scope:** the backend usage reports.

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Subject of the events. No UI for this domain. |
| Admin / support | Reads the usage and crash reports in the admin console. |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| TEL-FR-001 | While a rep is signed in, the app records time spans. `app_session` covers foreground time, with battery and charging state at start and end. `screen` records the screen key and owning tab. `network` records the online/offline state. Spans end as `switched`, `background`, `signed_out` or `app_killed` (recovered at the next launch). Spans shorter than 1 s are dropped. | Implemented | `components/UsageTracker.tsx`, `lib/usage/usageLog.ts` | TEL-TC-001 |
| TEL-FR-002 | One-off events: `login` (mode online/offline); `logout` (reason user / session_expired / credentials_rejected); `sync` (trigger manual/auto, source, outcome, duration, error). | Implemented | `lib/usage/usageLog.ts`, `providers/AuthProvider.tsx`, `providers/SyncProvider.tsx`, `lib/offline/backgroundSync.ts` | TEL-TC-001 |
| TEL-FR-003 | Crash capture (native only). Each non-fatal JS error is queued immediately as `js_error`, at most 20 per run. A fatal error is written to a run marker and reported at the next launch as `js_fatal`. A release-build run that ended on screen with no crash is reported as `unexpected_exit`. The message is capped at 1000 characters and the stack at 4000. | Implemented | `lib/crash/crashReporter.ts`, `app/_layout.tsx` | TEL-TC-002 |
| TEL-FR-004 | Events are uploaded with `POST /usage/app-events`, along with device info: id, platform, OS, app version and model. Uploads go in up to 10 rounds of 200 events. They run on open, every 5 minutes while active, on reconnect, on backgrounding and after a sync. Upload needs a real server token. On failure the events are kept; the server de-duplicates by event id. | Implemented | `lib/usage/usageLog.ts`, `components/UsageTracker.tsx` | TEL-TC-003 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| TEL-BR-001 | The queue holds at most 5000 events, dropping the oldest first. Progress is checkpointed every 30 s. | Unconfirmed | `lib/usage/usageLog.ts` | TEL-TC-003 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| TEL-DATA-001 | Every event has `id` (UUID), `type`, `at` and user fields (`user_id`, `user_name`, `display_name`, `mie_id`, `team_id`). The queue is `documentDirectory/e-detail-usage-log.json` (web: `localStorage` `e_detail_usage_log`). The run marker is `e-detail-run-marker.json`. | Implemented | `lib/usage/usageLog.ts`, `lib/crash/crashReporter.ts` | TEL-TC-003 |

## 7. API and Interface Contracts

Operation `postUsageEvents` in [openapi.json](../api/openapi.json).

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Upload fails | Events kept for next attempt | — (silent) |
| Fatal JS error | Recorded, then the default handler runs | OS crash dialog |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| TEL-SEC-001 | Telemetry contains no passwords, patient data or call content. It carries user identity, screen names, battery state and error messages and stacks. | Unconfirmed | `lib/usage/usageLog.ts`, `lib/crash/crashReporter.ts` | TEL-TC-001 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| TEL-AC-001 | Given a rep uses the app offline all day, when they come online, then all of the day's sessions, screens and syncs are uploaded once each. | TEL-FR-001, TEL-FR-004 |

## 11. Testing Requirements

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| TEL-TC-001 | Sign in, visit three screens, sign out; inspect the queued events. | `login`, `app_session`, three `screen` spans and `logout`, with user fields and nothing sensitive. | TEL-FR-001, TEL-FR-002, TEL-SEC-001 |
| TEL-TC-002 | Release build: throw a non-fatal error, then force a fatal one and relaunch. | `js_error` queued at once; `js_fatal` queued on relaunch. | TEL-FR-003 |
| TEL-TC-003 | Queue events offline; go online. | Batches posted; queue empties; a server failure keeps them. | TEL-FR-004, TEL-BR-001, TEL-DATA-001 |

## 12. Dependencies

- Backend `/usage/app-events`; `expo-battery`, `expo-crypto`, `expo-file-system`.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| TEL-GAP-001 | Screen keys are missing for `doctor-profiles`, `doctor-profile` and `explore`, which are filed as `other`. | Open |
| TEL-GAP-002 | Error messages and stacks may contain data from the failing context. No scrubbing is applied. Confirm this is acceptable. | Open |
