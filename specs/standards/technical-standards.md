---
id: SPEC-STD-TECH
title: Technical Standards
type: standard
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Technical Standards

These are the conventions the codebase already follows. New code must follow them unless an
ADR changes them.

## 1. Stack

| Area | Choice |
|---|---|
| Runtime | Expo SDK 54 (dev client, EAS Build), React Native 0.81, React 19.1, React Compiler enabled |
| Language | TypeScript, `strict`, path alias `@/` → repo root |
| Navigation | `expo-router` (file-based, typed routes) |
| UI | Tamagui and React Native StyleSheet; light theme only; Inter font |
| Server state | TanStack Query 5, persisted to a device file |
| HTTP | One shared axios instance, `config/axios.ts` (returns `response.data`) |
| Local storage | `expo-sqlite` (upload queues), the JSON file store `lib/offline/fileStore.ts`, `expo-secure-store` (secrets) |
| Lint | ESLint 9 with `eslint-config-expo` (`npm run lint`) |

## 2. Code organisation

| Folder | Holds |
|---|---|
| `app/` | Routes only. Thin files that render a view. |
| `views/<feature>/` | Screens and their feature-local components and rules |
| `api/` | One module per backend area: request functions, types, React Query hooks and keys |
| `lib/` | Framework-free logic: offline queues, auth helpers, location, analytics, telemetry |
| `providers/` | App-wide React context (Auth, Query, Outbox, Sync) |
| `components/` | Shared UI (`components/ui/`) |
| `config/`, `constants/` | Environment, HTTP client, static lists, theme |
| `specs/` | Specifications: the source of truth for intended behaviour |

## 3. Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PLAT-NFR-001 | Android is the production platform (package `com.searle.edetailing`). iOS is configured. Web is for local development and testing only. | Unconfirmed | `app.json`, `eas.json` | PLAT-TC-002 |
| PLAT-NFR-002 | Any data the rep creates is written to the device before any network call, and is uploaded by a queue that survives restarts (see [ADR-0002](../architecture/decisions/ADR-0002-offline-first-outbox.md)). | Implemented | `lib/offline/outbox.ts`, `lib/offline/patientOutbox.ts`, `lib/offline/doctorProfileOutbox.ts` | CALL-TC-011, PAT-TC-004, DINFO-TC-006 |
| PLAT-NFR-003 | Every HTTP call goes through the shared axios instance, and every endpoint is documented in `specs/api/openapi.json` (checked by the spec validator). | Implemented | `config/axios.ts`, `scripts/specs/validate-specs.mjs` | `scripts/specs/validate-specs.test.mjs` |
| PLAT-NFR-004 | A change to the shape of cached query data bumps `CACHE_BUSTER`. | Implemented | `lib/offline/persister.ts` | PLAT-TC-003 |
| PLAT-NFR-005 | Every build runs `scripts/bump-version.js`. It increments the patch version and Android `versionCode`, taking the highest across this checkout and the `sandbox`/`prod` branches (local and origin). EAS auto-increment is off. | Implemented | `scripts/bump-version.js`, `package.json`, `eas.json` | PLAT-TC-002 |
| PLAT-NFR-006 | The API base URL comes from `EXPO_PUBLIC_*` variables. The `sandbox` EAS profile sets its own URL and `EXPO_PUBLIC_BUILD_ENV=sandbox`. | Implemented | `config/api-base-url.ts`, `eas.json`, `.env.example` | PLAT-TC-002 |
| PLAT-NFR-007 | `npm run lint` passes with no errors before merge. | Implemented | `eslint.config.js` | PLAT-TC-001 |
| PLAT-NFR-008 | The UI is light-themed whatever the device setting, and fonts load before the first paint. | Implemented | `app/_layout.tsx`, `lib/typography.ts` | PLAT-TC-002 |

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| PLAT-TC-001 | Run `npm run lint`. | Exit code 0. | PLAT-NFR-007 |
| PLAT-TC-002 | Run `npm run build:sandbox`. | `app.json` version and versionCode incremented; APK installs over the previous build; app uses the sandbox API; light theme on a dark-mode phone. | PLAT-NFR-001, PLAT-NFR-005, PLAT-NFR-006, PLAT-NFR-008 |
| PLAT-TC-003 | Change a cached response type without bumping `CACHE_BUSTER`, and review. | Rejected in code review (checklist in the PR template). | PLAT-NFR-004 |

## 4. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| PLAT-GAP-001 | The repository has **no automated tests and no test runner** (`jest`/`vitest` are absent). Regression checking is limited to `npm run lint`, `npx tsc --noEmit` and manual test cases. See [migration-plan.md](../process/migration-plan.md) phase 3. | Open |
| PLAT-GAP-002 | `npx tsc --noEmit` currently fails locally with 10 "Cannot find module 'expo-file-system/legacy'" errors, because `expo-file-system` is declared in `package.json` but missing from the installed `node_modules`. A clean `npm ci` probably fixes it; confirm, then add type-checking to CI. | Open |
| PLAT-GAP-003 | The iOS `buildNumber` is bumped from the local value only, not taken as the highest across branches like the Android `versionCode`. | Open |
| PLAT-GAP-004 | `README.md` still contained the create-expo-app boilerplate (now prefixed with project and spec pointers). `scripts/reset-project.js` and the `reset-project` script are template leftovers that would wipe `app/`. | Open |
