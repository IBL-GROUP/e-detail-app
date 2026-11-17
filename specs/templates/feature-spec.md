---
id: SPEC-TEMPLATE-FEATURE
title: Feature Specification Template
type: template
template_for: feature
status: Approved
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

<!--
HOW TO USE THIS TEMPLATE
1. Copy to specs/features/<feature-slug>.md (kebab-case).
2. Replace the front matter. Use `type: feature`, a unique `id: SPEC-FEAT-<SLUG>`,
   `status: Draft`, and remove the `template_for` line.
3. Pick a requirement prefix (2–8 capitals, e.g. `TOUR`) and register it in
   specs/registry.json → "prefixes" with this file as its "spec".
4. Replace every `XXX` ID below with your prefix. Number from 001 and never reuse a number.
5. Delete these instructions and any guidance in > quotes once filled in.
6. Run `npm run specs:validate` and fix every error before opening the spec PR.
See specs/process/spec-first-workflow.md for the full process.
-->

# <Feature name>

## 1. Overview

> Two to five sentences: what the feature is, who it is for, and why it is needed now.
> Link the ticket or request that started it.

- **Ticket / request:** <link>
- **Related domain specs:** <links to specs/domains/*.md this feature changes>

## 2. Goals and Scope

**Goals**

- <measurable outcome>

**In scope**

- <capability>

**Out of scope**

- <explicitly excluded capability, to stop scope creep>

## 3. Actors

| Actor | Description | Permission section (if gated) |
|---|---|---|
| Medical Rep (TSO/MIE) | Field rep using the mobile app | `<SECTION>` → `ONE_FOR.MOBILE.E_DETAILING_APP.<SECTION>.VIEW` |

## 4. Functional Requirements

> One observable behaviour per row, in "The app shall …" style. Status for a new
> feature is `Planned` until it ships. Implementation may stay empty while Planned.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| XXX-FR-001 | The app shall … | Planned | | XXX-TC-001 |

## 5. Business Rules

> Constraints, formulas, thresholds, option lists, with exact values.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| XXX-BR-001 | … | Planned | | XXX-TC-002 |

## 6. Data Requirements

> Entities, fields (name, type, required, constraints), where each is stored
> (server, SQLite, file store, web storage), retention, and offline behaviour.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| XXX-DATA-001 | … | Planned | | XXX-TC-003 |

## 7. API and Interface Contracts

> Every endpoint used or added: method, path, request, response, errors. Add or
> change the operation in specs/api/openapi.json and list this feature's IDs in its
> `x-requirements`. Also describe screens and navigation entry points.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| XXX-API-001 | … | Planned | | XXX-TC-004 |

## 8. Error Handling

> What the rep sees and what the app does for offline, timeout, 4xx, 5xx, validation
> failure, storage full, and permission denied. Give the exact user-facing messages.

| Condition | Behaviour | User message |
|---|---|---|
| Offline | … | … |

## 9. Security Requirements

> Authentication, authorisation (server-side, not just hidden UI), PII handling,
> on-device storage, logging. See specs/standards/security.md.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| XXX-SEC-001 | … | Planned | | XXX-TC-005 |

## 10. Non-Functional Requirements

> Offline behaviour, performance budgets, battery and data use, accessibility, supported platforms.

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| XXX-NFR-001 | … | Planned | | XXX-TC-006 |

## 11. Acceptance Criteria

> Given / When / Then. Each criterion verifies one or more requirement IDs.

| ID | Criterion | Verifies |
|---|---|---|
| XXX-AC-001 | Given …, when …, then … | XXX-FR-001 |

## 12. Testing Requirements

> Automated tests to add (file path) and manual test cases. Every FR/BR/SEC row should be
> covered by at least one test case. Note the regression areas to re-test.

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| XXX-TC-001 | … | … | XXX-FR-001 |

## 13. Dependencies

> Backend endpoints or migrations, other teams, permissions to create in the
> roles-permission console, libraries, app release or EAS build requirements.

- <dependency>

## 14. Known Gaps and Open Questions

> Anything undecided. Do not guess; list it here and get an answer before building.

| ID | Observation | Status |
|---|---|---|
| XXX-GAP-001 | <question> — owner: <who decides> | Open |

## 15. Change Log

| Date | Change | Author | Approved by |
|---|---|---|---|
| YYYY-MM-DD | Initial draft | <name> | — |
