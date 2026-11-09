## What and why

<!-- One or two sentences. Link the ticket. -->

## Specification

<!-- Spec-first: see specs/process/spec-first-workflow.md -->

- Requirement IDs implemented / changed / deprecated: <!-- e.g. CALL-BR-001, DINFO-FR-007 -->
- Spec files changed: <!-- e.g. specs/domains/calls.md -->
- [ ] **No behaviour change** (refactor, style or dependency bump only), **or** the owning spec rows are updated in this PR or in an approved earlier PR
- [ ] New feature: its spec in `specs/features/` was **approved** before implementation
- [ ] No new business rule (threshold, option list, message, formula, retry policy) exists only in code
- [ ] Unclear or conflicting requirements were raised and resolved; any left open are recorded as `GAP` rows
- [ ] API changes are reflected in `specs/api/openapi.json` (with `x-requirements`)
- [ ] Cached response shape changed → `CACHE_BUSTER` bumped in `lib/offline/persister.ts`

## Verification

- [ ] `npm run specs:matrix` run and `specs/traceability/matrix.md` committed
- [ ] `npm run specs:validate` passes
- [ ] `npm run lint` passes
- [ ] Tests added or updated, or TC rows executed manually: <!-- list TC IDs and the device/build used -->

## Review

- [ ] Spec reviewed by the tech lead
- [ ] Business-rule changes confirmed by the product stakeholder
