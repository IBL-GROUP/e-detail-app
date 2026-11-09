---
id: SPEC-API-INDEX
title: API and Data Contracts
type: api
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# API and Data Contracts

[`openapi.json`](openapi.json) (OpenAPI 3.0.3) is the contract between this app and the backend
**as the app uses it**: what it sends and what it reads. The backend may offer more. View it in
any OpenAPI viewer, for example by pasting it into editor.swagger.io, or with the VS Code OpenAPI
extension.

## How it stays correct

`npm run specs:validate` checks the contract against the code:

| Rule | Check |
|---|---|
| API-001 … API-010 | Valid JSON, OpenAPI 3.x, unique `operationId`, responses present, path parameters declared, every `$ref` resolves |
| API-011 … API-013 | Each operation has `x-requirements`, and every listed ID exists (or is an external `DOC-*` ID) |
| API-014 | **Every `axios.<method>('/path')` in the app is documented.** Adding a call without documenting it fails CI. |
| API-015 | Warning: a documented operation the app no longer calls |

## Conventions

- Paths are relative to the base URL, which ends in `/api` (see `config/api-base-url.ts`).
- The axios interceptor returns `response.data`, so schemas describe the JSON body.
- Upload endpoints (`/calls/batch`, `/patients/batch`, `/doctor-profiles/batch`) return a
  per-item result. A 4xx `status` on an item means "this row is wrong"; a 5xx or missing
  `status` means "the server failed". The queues depend on that distinction (see
  CALL-API-002).
- `401` responses with `code` `TOKEN_EXPIRED`, `TOKEN_INVALID` or `TOKEN_MISSING` end the session
  (AUTH-FR-007); other 401s do not.
- Field types follow the TypeScript interfaces. Where types are inconsistent between endpoints
  (string vs number ids), that is recorded as a GAP, not normalised here (CONT-GAP-002).

## Changing the contract

Contract changes go in the same PR as the spec rows they serve. Coordinate breaking changes with
the backend, and keep the old field readable until every installed app version has been updated:
reps sideload APKs and may lag.

## Endpoints by domain

| Domain | Operations |
|---|---|
| Auth | `login`, `getOfflineUsers`, `changePassword` |
| Permissions | `getMyPermissions` |
| Sync | `getDailySync`, `getPlannedAll` |
| Calls and doctors | `getPlannedDoctors`, `getDoctors`, `postCallsBatch`, `postCall` (unused), `getCompletedDoctorIds`, `getCallNotes`, `getDoctorCallSummary`, `getForcingContent`, `getTeamSkus` |
| Content | `getTeamBrands`, `getMieBrands`, `getSpecialties` |
| Analytics | `getMonthlyCallTotals`, `getEngagement`, `getSlideEngagement`, `getMieSalesSummary` |
| Patients | `getPatients`, `postPatientsBatch`, `uploadPatientAttachment` |
| Doctor Info | `getDoctorProfiles`, `getAssignedDoctors`, `getProfileMaster`, `lookupPmdc`, `addHospital`, `postDoctorProfilesBatch`, `uploadVisitingCard` |
| Telemetry | `postUsageEvents` |
