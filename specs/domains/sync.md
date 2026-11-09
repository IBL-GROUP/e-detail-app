---
id: SPEC-DOMAIN-SYNC
title: Daily Sync and Offline Data
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Daily Sync and Offline Data

> Reverse-engineered from the code at commit `e4f6eda`. Upload queues for calls, patients and
> profiles are specified in their own domains. This spec covers *downloading* data and keeping
> it on the device.

## 1. Overview

Reps work in places with little or no signal, so the app downloads each day's working set in
one bundled request. That set is the planned doctors, the team's doctor pool, SKUs, brands and
the slide deck for each doctor. The app seeds it into the React Query cache under the keys the
screens already read, downloads every slide image to the phone, and writes the cache to disk.
Screens are online-first: when connected they fetch live, and when offline they render from
the saved cache.

## 2. Goals and Scope

**In scope:** daily sync and its triggers, the background task, the first-run gate and status
banner, the planned-list bulk bootstrap, the image cache, and query-cache persistence.
**Out of scope:** upload queues ([calls.md](calls.md), [patients.md](patients.md),
[doctor-info.md](doctor-info.md)) and the Analytics prefetch ([analytics.md](analytics.md)).

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Can trigger a sync manually; otherwise sync runs automatically. |
| OS background scheduler | Runs the headless background sync task (`expo-background-task`). |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SYNC-FR-001 | A sync calls `GET /sync/daily?teamId&mieId` once. It then: (1) seeds the planned doctors, the team's unplanned doctor pool, team SKUs, team brands and each doctor's forcing deck into the cache under the screens' own keys; (2) downloads every slide and content image; (3) writes the cache to disk; (4) records the server's `workdayDate` and the sync time. | Implemented | `lib/offline/runSync.ts`, `api/sync.ts` | SYNC-TC-001 |
| SYNC-FR-002 | Sync runs: (a) once per signed-in user per app process, on sign-in or app open, when online; (b) when the cached data is not for today, at most once until it succeeds, the network returns, or the app returns to the foreground; (c) on demand from Settings › Sync now, the first-run gate, the status banner and Sync Details. Only one sync runs at a time. | Implemented | `providers/SyncProvider.tsx` | SYNC-TC-002 |
| SYNC-FR-003 | A background task (minimum interval 6 h, as scheduled by the OS) runs the same sync headlessly. It does nothing if today's data is already present or no rep with team and MIE is signed in. | Implemented | `lib/offline/backgroundSync.ts`, `app/_layout.tsx` | SYNC-TC-003 |
| SYNC-FR-004 | No sync runs in an offline session (there is no server token). It runs as soon as the session is upgraded. | Implemented | `providers/SyncProvider.tsx` | SYNC-TC-004 |
| SYNC-FR-005 | With no data on the phone, the app is blocked by a full-screen gate. While syncing it reads "Preparing today's calls…" with a download count. When idle it reads "No offline data yet" with Download now (online) or Retry (offline); in an offline session it explains that a server sign-in is needed. With data present, a thin banner appears only while offline, while syncing, or in an offline session that is online. | Implemented | `components/ui/SyncGate.tsx` | SYNC-TC-004 |
| SYNC-FR-006 | On app open and after sign-in, the app downloads every rep's planned list (`GET /doctor/planned-all`, header `x-app-key`) and stores each rep's list separately. That list fills the planned screen when its cache is empty, so a rep who has never synced on this phone still sees their doctors offline. A rep missing from the response has their stored list deleted. | Implemented | `lib/offline/plannedBulk.ts`, `providers/AuthProvider.tsx`, `providers/SyncProvider.tsx` | SYNC-TC-005 |
| SYNC-FR-007 | Images are downloaded to `documentDirectory/offline-images/` (3 at a time); files no longer referenced are deleted. Screens use the local copy first. On web this is skipped. | Implemented | `lib/offline/imageCache.ts`, `components/ui/OfflineImage.tsx` | SYNC-TC-001 |
| SYNC-FR-008 | Settings › Offline Data shows connection state, last synced time (or "Never") and a Sync now button. Sync Details shows the app version, the last sync and the pending uploads. | Implemented | `app/(tabs)/settings.tsx`, `views/settings/SyncDetailsModal.tsx` | SYNC-TC-002 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SYNC-BR-001 | Data is *stale* when the stored `workdayDate` differs from today's date on the device (`YYYY-MM-DD`, device local time). | Implemented | `lib/offline/syncMeta.ts`, `providers/SyncProvider.tsx` | SYNC-TC-002 |
| SYNC-BR-002 | Each slide deck is keyed by team, doctor and rep, exactly as the call screen asks for it. A deck seeded under any other key cannot be found offline. | Implemented | `lib/offline/runSync.ts`, `api/content.ts` | SYNC-TC-001 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SYNC-DATA-001 | The query cache is saved to a device file (`react-query-cache` key) and kept for 7 days. Only successful queries are saved, at most once every 4 s and after interactions. Cache version `v3`: bump `CACHE_BUSTER` whenever a cached response shape changes. | Implemented | `lib/offline/persister.ts`, `providers/QueryProvider.tsx` | SYNC-TC-006 |
| SYNC-DATA-002 | Key–value storage is one JSON file per key, `documentDirectory/e-detail-offline-<key>.json` (web: `localStorage` prefix `e-detail-offline:`). Keys include `react-query-cache`, `sync-meta`, `image-manifest` and `permissions-<userId>`. Planned bulk is stored per rep under `e_detail_app_planned_bulk:<mieId>`. | Implemented | `lib/offline/fileStore.ts`, `lib/offline/syncMeta.ts`, `lib/offline/plannedBulk.ts` | SYNC-TC-006 |

## 7. API and Interface Contracts

Operations `getDailySync` and `getPlannedAll` in [openapi.json](../api/openapi.json). Slide
images are plain GETs of the URLs in the payload, sent without auth headers.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SYNC-API-001 | Asset URLs are normalised to the API origin: `localhost`/`127.0.0.1` hosts and relative `/uploads/` paths are rewritten, and backslashes become `/`. | Implemented | `api/content.ts` | SYNC-TC-001 |

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Sync request fails | Status `error`; cached data stays; automatic catch-up re-arms on reconnect or foreground | Sync Details: "The last sync didn't finish. Check your connection and try again." |
| First run, offline | Gate blocks the app | "No offline data yet — Connect to the internet to download today's content." |
| Image download fails | That image falls back to the server URL when shown | — |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SYNC-SEC-001 | Cached data is keyed by rep (`mieId`/`teamId`), so a different rep signing in on the same phone does not read another rep's cached lists. | Implemented | `api/doctor.ts`, `api/content.ts`, `providers/AuthProvider.tsx` | SYNC-TC-007 |

## 10. Non-Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SYNC-NFR-001 | Screens are online-first. Queries refetch on mount and on reconnect (fresh for 5 min, 1 retry); offline they pause and render the saved cache. | Implemented | `providers/QueryProvider.tsx` | SYNC-TC-006 |
| SYNC-NFR-002 | Sync must not freeze the UI. Cache writes are batched into one notification, the sync yields to the UI between heavy steps, and progress updates at most 4 times a second. | Implemented | `lib/offline/runSync.ts`, `providers/SyncProvider.tsx` | SYNC-TC-001 |

## 11. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| SYNC-AC-001 | Given a fresh install, when the rep signs in online, then the gate shows progress, and afterwards in airplane mode every planned doctor, deck and content image is available. | SYNC-FR-001, SYNC-FR-005, SYNC-FR-007 |
| SYNC-AC-002 | Given yesterday's data, when the rep opens the app online, then a sync runs automatically without any tap. | SYNC-FR-002, SYNC-BR-001 |

## 12. Testing Requirements

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| SYNC-TC-001 | Fresh install, sign in online, then go to airplane mode and open several doctors' decks and Content. | All slides and content images render from the phone; no network errors. | SYNC-FR-001, SYNC-FR-007, SYNC-BR-002, SYNC-API-001, SYNC-NFR-002 |
| SYNC-TC-002 | Set the stored `sync-meta` to yesterday (or wait past midnight) and open the app online; also tap Settings › Sync now. | Automatic sync runs once; Last synced updates; a second tap during a sync does nothing. | SYNC-FR-002, SYNC-FR-008, SYNC-BR-001 |
| SYNC-TC-003 | Android: run the background task via `adb shell cmd jobscheduler run` with stale data. | Sync runs headless; a usage event `sync` with `source=background` is queued. | SYNC-FR-003 |
| SYNC-TC-004 | Offline session on a fresh install, then the network comes back. | Gate explains a server sign-in is needed; after the upgrade the sync runs. | SYNC-FR-004, SYNC-FR-005 |
| SYNC-TC-005 | Fresh install, online at the sign-in screen (bulk downloads), then sign in offline as a rep who never used this phone. | Their planned doctors are listed. | SYNC-FR-006 |
| SYNC-TC-006 | Use the app online, kill it, reopen offline. | Previously viewed screens render from the cache. | SYNC-NFR-001, SYNC-DATA-001, SYNC-DATA-002 |
| SYNC-TC-007 | Rep A syncs and signs out; rep B signs in on the same phone. | B never sees A's doctor lists. | SYNC-SEC-001 |

## 13. Dependencies

- Backend `/sync/daily` and `/doctor/planned-all`. The backend's `OFFLINE_SYNC_KEY` must match.
- `@tanstack/react-query` and `react-query-persist-client`, `expo-file-system`, `expo-background-task`, `expo-task-manager`, NetInfo.

## 14. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| SYNC-GAP-001 | The stale check compares the server's `workdayDate` with the device's local date. A device clock or time zone that differs from the server's flips staleness around midnight (noted as a TODO in `lib/offline/syncMeta.ts`). | Open |
| SYNC-GAP-002 | `doctors`, `unplannedDoctors` and `forcing` in `/sync/daily` have no fallback, so if the backend omits one the whole sync fails. The `imageUrls` field the backend sends is ignored. | Open |
| SYNC-GAP-003 | Neither the background task nor `runSync` flushes the upload queues, so queued calls upload only while the app is open. Confirm whether the overnight task should also upload. | Open |
| SYNC-GAP-004 | `/doctor/planned-all` puts **every** rep's planned list on every phone, behind the shared app key (see AUTH-GAP-001). Confirm this is acceptable from a data-privacy standpoint. | Open |
| SYNC-GAP-005 | `clearImageCache()` is documented as "used on logout" but is never called, so images persist across reps on a shared phone. This may be intentional, given AUTH-FR-008. | Open |
