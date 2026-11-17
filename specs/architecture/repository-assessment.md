---
id: SPEC-ARCH-ASSESSMENT
title: Repository Assessment (Spec-First Migration Baseline)
type: architecture
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Repository Assessment

Baseline taken on 2026-11-06 at commit `e4f6eda` (branch `merge/doctor-info-gathering`), before
the specification-first migration. It inventories what exists, what was documented, and what was
not.

## 1. Repository at a glance

| Item | Finding |
|---|---|
| Product | "Searle E-Detailing", a mobile app for pharmaceutical field reps (TSO/MIE) |
| Stack | Expo SDK 54, React Native 0.81, React 19, TypeScript (strict), expo-router, TanStack Query, SQLite |
| Size | 242 tracked files; about 16.5k lines in `api/`, `config/`, `providers/` and `lib/` alone |
| History | About 97 commits, 2 authors |
| Platforms | Android (production, sideloaded APK via EAS), iOS configured, web for development |
| Backend | Separate repository (not present); HTTP JSON API under `/api` |

## 2. Modules and domain boundaries

| Layer | Contents |
|---|---|
| `app/` (22 routes) | Root stack (`login`, `(tabs)`, `call/[id]`, `modal`) and 17 tab routes, 13 of them hidden |
| `views/` (10 features) | dashboard, planned-calls (incl. call-screen, doctor-detail, call-analytics), unplanned-calls, doctor-list, doctor-profiles, patients, content-library, my-brands, settings |
| `api/` (10 modules) | calls, content, doctor, doctorProfiles, patients, sales, sku, sync, endpoints, offlineFallback |
| `lib/` | auth (permissions, token, pending password), offline (3 queues × native/web stores, ledger, caches, sync), location, analytics, usage, crash |
| `providers/` | Auth, Query, Outbox, Sync |
| `components/` | Shared UI kit (`components/ui/`, 30 components), PermissionGate, UsageTracker |

The nine business domains and their boundaries are in [system-architecture.md §3](system-architecture.md#3-business-domains).

## 3. Inventory

| Category | Count | Where documented now |
|---|---|---|
| HTTP endpoints called | 33 (32 in use, 1 defined but unused: `POST /calls`), plus raw image GETs | [openapi.json](../api/openapi.json) |
| Shared-key (pre-login) endpoints | 2 | [security.md](../standards/security.md) |
| Data models (TypeScript interfaces sent or received) | about 45 | `components.schemas` in [openapi.json](../api/openapi.json); domain Data sections |
| Device integrations | GPS, camera, photo library, SecureStore, SQLite, file system, background task, battery, NetInfo | Domain specs, [system-architecture.md](system-architecture.md) |
| External systems | Backend API, roles-permission, PMDC (via backend), sales warehouse (via backend), admin console, EAS | [system-architecture.md §1](system-architecture.md#1-context) |
| Business rules and requirements captured | See the live counts in [the traceability matrix](../traceability/matrix.md) | `specs/domains/*.md` |

## 4. Existing documentation reviewed

| Document | Assessment |
|---|---|
| `README.md` | create-expo-app boilerplate; no project information. Now prefixed with project and spec pointers. |
| `USER_MANUAL.md`, `TRAINING_MANUAL.md` (+ `.docx`) | Good end-user descriptions of the call flow, call types, offline use and "rules that matter most". Used as **evidence of intent** when classifying requirements as `Implemented`. |
| Code comments | Extensive and high quality. They explain *why* (backend quirks, offline edge cases, past bugs). They were the main source for the specs, but they were scattered, sometimes stale (see CALL-GAP-012), and not reviewable as requirements. |
| Backend spec FEAT-doctor-info-gathering | Cited by `DOC-*` IDs in code, but **not present** in this repository (DINFO-GAP-001). |
| Architecture docs, API docs, ADRs, contribution guide, agent instructions | **None existed.** |

## 5. Tests and quality gates

| Gate | Finding |
|---|---|
| Automated tests | **None.** No test runner is configured (PLAT-GAP-001). |
| Lint | `npm run lint` (eslint-config-expo) passes. |
| Type check | `npx tsc --noEmit` fails locally with 10 errors, all "Cannot find module 'expo-file-system/legacy'". The package is missing from the installed `node_modules`, so this is an environment issue, not a code defect (PLAT-GAP-002). |
| CI/CD | **None** (no `.github/`). Builds run by hand through `npm run build:sandbox` / `build:prod` and EAS. |
| Manual QA | Implicit in the Training Manual's "Check yourself" exercises. |

## 6. Documentation gaps found (now addressed)

| Gap | Addressed by |
|---|---|
| No single description of intended behaviour | `specs/domains/*.md` (9 domains) |
| No API contract | `specs/api/openapi.json` + drift check |
| No architecture overview or storage map | [system-architecture.md](system-architecture.md) |
| No record of key decisions | [decisions/](decisions/) |
| No security overview | [security.md](../standards/security.md) |
| No contribution or review workflow | [spec-first-workflow.md](../process/spec-first-workflow.md), PR template |
| No instructions for AI agents | `AGENTS.md` |
| No requirement IDs or traceability on the app side | [CONVENTIONS.md](../CONVENTIONS.md), [matrix.md](../traceability/matrix.md) |

## 7. Undocumented or ambiguous behaviour

Recorded as `GAP` rows in each domain spec; the full list is in the
[traceability matrix](../traceability/matrix.md#known-gaps-and-open-questions). The most important:

1. **Security.** Every active user's password hashes, and every rep's planned list, are
   downloaded to every device behind a shared key (AUTH-GAP-001, SYNC-GAP-004). Cleartext HTTP is
   allowed (SECR-GAP-001). The session token is stored in a plain file (AUTH-GAP-002).
2. **Data integrity.** Queued items are dropped after 5 server rejections, which contradicts the
   "Nothing is lost" promise (CALL-GAP-001, PAT-GAP-003, DINFO-GAP-003). The ledger is synced per
   call rather than per phase (CALL-GAP-003).
3. **Shared phones.** Several local stores are not separated by rep (SECR-GAP-005).
4. **Intent unknown.** Minimum slide time is measured but not enforced (CALL-GAP-002). Unplanned
   calls are half-retired (CALL-GAP-009). Several analytics labels and PDF tones are misleading
   (ANLY-GAP-001, ANLY-GAP-002).
