---
id: SPEC-PROCESS-MIGRATION
title: Incremental Migration Plan
type: plan
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Incremental Migration Plan

How the repository moves from "behaviour lives in code" to "behaviour lives in specs", without
changing app behaviour along the way.

## Principles

- **No behaviour change from documentation work.** This migration adds only `specs/`,
  `scripts/specs/`, `AGENTS.md`, `CLAUDE.md`, CI and PR template files, npm scripts, and a README
  header. App code is untouched.
- **Reverse-engineer honestly.** Code-only behaviour is `Unconfirmed`, and defects are `GAP` rows.
- **Prioritise by risk.** Domains that create data, or that other domains depend on, come first.
- **New work is spec-first from day one** ([workflow](spec-first-workflow.md)).

## Domain priority

| Priority | Domain | Why | Coverage now |
|---|---|---|---|
| P1 | Calls ([calls.md](../domains/calls.md)) | Core business record; offline queue; quotas | Documented |
| P1 | Auth ([auth.md](../domains/auth.md)) | Security; offline sign-in | Documented |
| P1 | Sync ([sync.md](../domains/sync.md)) | Everything offline depends on it | Documented |
| P1 | Security ([security.md](../standards/security.md)) | Cross-cutting risks | Documented |
| P2 | Doctor Info ([doctor-info.md](../domains/doctor-info.md)) | Newest feature; most validation rules | Documented |
| P2 | Patients ([patients.md](../domains/patients.md)) | Health data; offline queue | Documented |
| P2 | Permissions ([permissions.md](../domains/permissions.md)) | Feature access | Documented |
| P3 | Analytics ([analytics.md](../domains/analytics.md)) | Read-only figures | Documented (formulas); chart layout not specified |
| P3 | Content ([content.md](../domains/content.md)), Telemetry ([telemetry.md](../domains/telemetry.md)) | Read-only / internal | Documented |
| P4 | Shared UI kit (`components/ui/`), theme and typography | Presentation only | Not specified, by design (covered by technical standards) |

## Phases

| Phase | Work | Exit criteria | State |
|---|---|---|---|
| 0. Foundation | `specs/` structure, conventions, templates, validator and tests, CI, `AGENTS.md`, PR template | Validator green in CI | **Done** (this change) |
| 1. Baseline specs | Reverse-engineer every domain, the API contract, architecture, security and the assessment | All domains have a Draft spec; all 33 endpoints in the contract | **Done** (this change) |
| 2. Stakeholder review | Walk each P1 then P2 spec with the tech lead and product owner. Answer every `Open` GAP and turn `Unconfirmed` into `Implemented` or a change request. Set specs to `Approved`. Obtain or vendor the backend `DOC-*` spec. | P1 and P2 specs `Approved`; no `Open` GAP without an owner and date | Next |
| 3. Automated verification | Add a unit-test runner (e.g. `jest-expo`). Test the pure rule modules first: `lib/location/distance.ts`, `views/planned-calls/callTypes.ts`, `views/doctor-profiles/profileRules.ts`, `lib/analytics/summaryMetrics.ts`, `lib/phone.ts`, `lib/offline/localCallModels.ts`. Replace TC references with test files in Verification. Add `tsc` and lint to CI once `npm ci` is green. | Every P1 BR row has an automated test | Planned |
| 4. Fix confirmed gaps | Each `Confirmed` GAP becomes a spec change, then code, then a test, through the normal workflow | GAP rows `Resolved` | Planned |
| 5. Steady state | Spec-first for all work; quarterly `last_reviewed` sweep | Matrix shows no `Unconfirmed` P1 rows | Ongoing |

## Definition of done per domain

A domain is **migrated** when:
- its spec is `Approved`;
- every requirement row is `Implemented`, `Planned` or `Deprecated` (no `Unconfirmed`);
- every GAP is resolved or accepted, or is a tracked defect with an owner;
- every BR and SEC row has an automated test, or a TC that runs in release QA.
