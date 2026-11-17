---
id: SPEC-ADR-0002
title: "ADR-0002: Offline-first data with device queues (retroactive)"
type: adr
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# ADR-0002: Offline-first data with device queues (retroactive)

- **Date:** recorded 2026-11-06. The decision predates this record and is reconstructed from the code and its comments.
- **Deciders:** original app team (to be confirmed)
- **Supersedes / superseded by:** —

## Context

Reps work in clinics and hospitals with weak or no signal. Losing a recorded call is
unacceptable (User Manual: "Nothing is lost"), and the rep must be able to sign in, see
doctors and present slides without a network.

## Decision

- **Reads.** One bundled daily sync seeds the React Query cache, which is persisted to a device
  file for 7 days, and downloads all images. Screens fetch live when online and fall back to the
  cache when offline (SYNC-FR-001, SYNC-NFR-001).
- **Writes.** Every record the rep creates (call phase, patient, doctor profile, password change)
  is written to a device queue first: SQLite on native, web storage on web. Queues are flushed
  in batches on triggers such as app start, reconnect, a token becoming available, and manual
  sync. The server upserts on client-generated ids, so a resend is harmless (CALL-API-002,
  PAT-API-001, DINFO-API-001).
- **Retry.** A per-item 4xx counts as a rejection, and the row is removed after 5. A 5xx, a
  network error or a missing status is retried indefinitely. Never discard on a guess.
- **Figures.** Local, not-yet-counted calls are merged into server figures by time, so counts
  update instantly (CALL-FR-016).
- **Auth.** Offline sign-in uses an on-device login mirror (AUTH-FR-003).

## Consequences

- Reps can work all day without signal.
- Complexity: three near-identical queue implementations (calls, patients, profiles), each with a
  native and a web store, and merge logic in `lib/offline/localCallModels.ts`.
- Known weaknesses are recorded as gaps: CALL-GAP-001, CALL-GAP-003, CALL-GAP-004, PAT-GAP-002,
  PAT-GAP-004, DINFO-GAP-002, AUTH-GAP-001, SYNC-GAP-003.
- Candidate follow-up: extract a shared queue module with unit tests (migration plan, phase 3).
