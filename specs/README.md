---
id: SPEC-INDEX
title: Specifications Index
type: index
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Specifications: Searle E-Detailing App

This folder is the **source of truth for how the app is meant to behave**. Code implements the
specs, and tests verify them. When the two disagree, either the code has a bug or the spec needs
an approved change; either way, it gets fixed.

**New here?** Read, in order:
1. [product overview](product/product-overview.md)
2. [system architecture](architecture/system-architecture.md)
3. the domain you are working in
4. [the workflow](process/spec-first-workflow.md)

## Map

| Area | Document | What it holds |
|---|---|---|
| **Rules for specs** | [CONVENTIONS.md](CONVENTIONS.md) | ID format, statuses, table formats, traceability, validator rules |
| | [registry.json](registry.json) | Machine-readable prefixes and mandatory sections |
| **Process** | [process/spec-first-workflow.md](process/spec-first-workflow.md) | How to create, review and update specs; PR rules |
| | [process/migration-plan.md](process/migration-plan.md) | Incremental migration phases and domain priorities |
| **Product** | [product/product-overview.md](product/product-overview.md) | Purpose, users, capabilities, principles, glossary |
| **Architecture** | [architecture/system-architecture.md](architecture/system-architecture.md) | Context, components, domains, data flows, storage, routes, integrations |
| | [architecture/repository-assessment.md](architecture/repository-assessment.md) | Baseline inventory and documentation gaps |
| | [architecture/decisions/](architecture/decisions/) | ADR-0001 (spec-first), ADR-0002 (offline-first queues) |
| **Business domains** | [domains/auth.md](domains/auth.md) | `AUTH`: sign-in (online and offline), session, password |
| | [domains/permissions.md](domains/permissions.md) | `PERM`: dashboard, tabs, permission codes |
| | [domains/sync.md](domains/sync.md) | `SYNC`: daily sync, cache, images, background task |
| | [domains/calls.md](domains/calls.md) | `CALL`: doctors, arrival, calls, cancellations, call queue |
| | [domains/doctor-info.md](domains/doctor-info.md) | `DINFO`: doctor profiles (backend IDs `DOC-*`) |
| | [domains/patients.md](domains/patients.md) | `PAT`: patient log |
| | [domains/content.md](domains/content.md) | `CONT`: Content and Portfolio |
| | [domains/analytics.md](domains/analytics.md) | `ANLY`: call and sales analytics, PDF |
| | [domains/telemetry.md](domains/telemetry.md) | `TEL`: usage and crash reporting |
| **Features** | [features/](features/README.md) | New feature specs (spec-first) |
| **API and data** | [api/README.md](api/README.md), [api/openapi.json](api/openapi.json) | Every endpoint the app calls, its schemas, and the requirements it serves |
| **Standards** | [standards/technical-standards.md](standards/technical-standards.md) | `PLAT`: stack, code layout, build and version rules |
| | [standards/security.md](standards/security.md) | `SECR`: security requirements and known risks |
| **Templates** | [templates/feature-spec.md](templates/feature-spec.md), [templates/adr.md](templates/adr.md) | Start every new spec or ADR here |
| **Traceability** | [traceability/matrix.md](traceability/matrix.md) | Generated: requirement → status → code → verification, plus every open gap |

## Commands

```bash
npm run specs:validate   # structure, IDs, references, paths, API contract, matrix freshness
npm run specs:matrix     # regenerate traceability/matrix.md after editing specs
npm run specs:test       # the validator's own tests
```

CI runs the same checks on every push and pull request (`.github/workflows/specs.yml`).

## Status of this baseline

All domain specs are **Draft**. They were reverse-engineered from the code on 2026-11-06 and need
stakeholder review (migration plan, phase 2). Rows marked `Unconfirmed`, and every `Open` gap,
are questions for the product owner, not settled requirements.
