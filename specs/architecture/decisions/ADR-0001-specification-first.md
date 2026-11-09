---
id: SPEC-ADR-0001
title: "ADR-0001: Adopt specification-first development"
type: adr
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# ADR-0001: Adopt specification-first development

- **Date:** 2026-11-06
- **Deciders:** pending approval by the app tech lead and product owner
- **Supersedes / superseded by:** —

## Context

The app's business rules were recorded only in code comments, the User and Training manuals, and
the authors' heads. Examples are visit quotas, call recording, offline retry rules, profile
validation and the analytics formulas. Reviewers could not tell intended behaviour from
accidental behaviour. AI coding agents changed behaviour with no reference to check against.
The backend already uses requirement IDs (`DOC-*` for Doctor Information Gathering) that the
app's code cites, but the app had no specs of its own.

## Decision

1. `specs/` is the source of truth for intended behaviour. Specs are written or updated
   **before** a behaviour change is implemented, and are reviewed in the same PR or an earlier one.
2. Requirements carry unique IDs, `<PREFIX>-<TYPE>-<NNN>` (compatible with the backend's `DOC-*`
   scheme), and link to the code and tests that implement and verify them.
3. Existing behaviour is documented incrementally, by reverse-engineering. Observed-but-unconfirmed
   behaviour is marked `Unconfirmed`, and defects or ambiguities are recorded as `GAP` rows, never
   silently promoted to requirements.
4. A zero-dependency validator, run locally and in CI, enforces structure, IDs, references,
   the API contract and the freshness of the traceability matrix.
5. `AGENTS.md` instructs AI agents to follow the same workflow.

## Consequences

- Easier: review ("does the code match the spec?"), onboarding, agent safety, and planning tests
  (each TC row is a ready-made test case).
- Harder: every behaviour change costs a spec edit, and the matrix must be regenerated (one command).
- Follow-up: [migration-plan.md](../../process/migration-plan.md) covers stakeholder review of the
  Draft specs, resolving the GAP rows, and adding a unit-test runner.
- Requirements produced: SFR-FR-001 to SFR-FR-007, SFR-NFR-001, SFR-NFR-002.
