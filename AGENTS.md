# AGENTS.md — instructions for AI coding agents

This repository is **specification-first**. `specs/` is the source of truth for intended
behaviour, and you must follow the workflow below for every change. These rules apply to any
agent: Claude Code, Codex, Copilot, Cursor and others.

## The project in one paragraph

"Searle E-Detailing" is an Expo / React Native (TypeScript) app for pharmaceutical field reps. It
lists their planned doctors, records GPS-anchored detailing calls with a slide deck, captures
doctor profiles and patients, and shows call and sales analytics. It is **offline-first**: all
data is downloaded daily, and everything the rep records is queued on the device and uploaded
later. Start with [specs/README.md](specs/README.md).

## Mandatory workflow

### 1. Before writing code: read the specs

1. Find the owning spec. Use the domain table in [specs/README.md](specs/README.md), or search
   `specs/` for the screen, file or endpoint you are touching. Use the Implementation column of
   [specs/traceability/matrix.md](specs/traceability/matrix.md) to go from a file to its
   requirements.
2. Read every requirement row (`<PREFIX>-<TYPE>-<NNN>`) that covers the behaviour you will
   touch, plus that spec's **Known Gaps and Open Questions** section.
3. For any endpoint you call or change, read its operation in
   [specs/api/openapi.json](specs/api/openapi.json).

### 2. Identify missing, ambiguous or conflicting requirements — and stop

Before implementing, check:

- Does a requirement cover the behaviour? If not, the behaviour is **unspecified**.
- Is the row `Unconfirmed` or linked to an `Open` GAP? Then its intent is **unknown**.
- Does the request conflict with an existing row, another domain, the API contract or the User
  Manual?

If any answer is yes, **do not invent the answer**. Tell the user exactly which rule is missing or
conflicting, cite the IDs, propose options, and ask. Proceed only on the user's decision, and
record that decision in the spec.

### 3. Update the spec first, then the code

- **Changing behaviour:**
  1. Edit the requirement row(s) first: text, Status, Implementation.
  2. Then change the code.
  3. Add or extend rows; never renumber or reuse IDs.
  4. Remove behaviour by setting the row to `Deprecated`.
- **New feature:**
  1. Create `specs/features/<slug>.md` from
     [specs/templates/feature-spec.md](specs/templates/feature-spec.md).
  2. Register its prefix in [specs/registry.json](specs/registry.json).
  3. Get the user's approval of the spec before implementing significant work.
- **API change:** update `specs/api/openapi.json`, including `x-requirements`. CI fails if the app
  calls an endpoint the contract does not document.
- Cite requirement IDs in commit messages, and in code comments next to non-obvious rules
  (e.g. `// CALL-BR-001`).

### 4. Keep code, specs and tests aligned

- Update the **Verification** column with the tests you add, or the TC rows you rely on. When
  you change a rule, update the TC rows that verify it.
- Run, and make pass:
  ```bash
  npm run specs:matrix     # regenerate the traceability matrix (commit it)
  npm run specs:validate   # must report 0 errors
  npm run specs:test
  npm run lint
  ```
- In your summary, list the requirement IDs you added, changed or implemented, and any GAPs you
  opened.

## Hard rules

1. **Never introduce an undocumented business rule.** A threshold, option list, message, formula,
   retry policy or permission check that a rep or the office would notice must exist as a spec
   row.
2. **Never silently change an approved requirement.** If the code you are asked to write
   contradicts a row, raise it. Do not just edit the code, or just edit the row.
3. **Never treat observed behaviour as intended.** `Unconfirmed` rows and `Open` GAPs are
   questions, not requirements. Do not "fix" them, or build on them, without a decision.
4. **Do not rewrite working code to match your taste.** Documentation and spec work must not change
   app behaviour.
5. **Offline-first is non-negotiable** ([ADR-0002](specs/architecture/decisions/ADR-0002-offline-first-outbox.md)).
   Anything a rep records is written to the device before any network call. Never drop queued
   data on a guess.
6. **Security** ([specs/standards/security.md](specs/standards/security.md)):
   - Secrets go in SecureStore, never in plain files.
   - `EXPO_PUBLIC_*` values are public.
   - Permission codes hide UI only, so authorisation belongs to the backend.
   - Do not add logging of tokens, passwords or patient data.
7. Bump `CACHE_BUSTER` in `lib/offline/persister.ts` when a cached response shape changes.

## Repository facts

| Need | Where |
|---|---|
| Routes | `app/` (thin), screens in `views/<feature>/` |
| HTTP | `api/*` through `config/axios.ts` only |
| Offline queues, sync, caches | `lib/offline/` |
| Providers | `providers/` (Auth, Query, Outbox, Sync) |
| Path alias | `@/` = repository root |
| Lint | `npm run lint` |
| Type check | `npx tsc --noEmit` (currently needs a clean `npm ci`; see PLAT-GAP-002) |
| Tests | No app test runner yet (PLAT-GAP-001). Rely on the TC rows in specs for manual verification, and say so. |
| Builds | `npm run build:sandbox` / `build:prod` bump the version first. Never edit `versionCode` by hand. |
