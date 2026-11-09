---
id: SPEC-CONVENTIONS
title: Specification Conventions — IDs, Statuses, Tables and Traceability
type: standard
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Specification Conventions

This file is the rulebook for writing specs in this repository. The validator
(`scripts/specs/validate-specs.mjs`) enforces everything marked **(enforced)**.
The machine-readable half of these rules lives in [`registry.json`](registry.json).

## 1. Spec files

Every Markdown file under `specs/` starts with front matter **(enforced)**:

```yaml
---
id: SPEC-CALLS            # unique across specs/
title: Doctors and Call Reporting
type: domain              # index | process | standard | product | architecture | adr |
                          # domain | feature | api | plan | template | traceability
status: Draft             # Draft | In Review | Approved | Deprecated
owner: <role or team accountable for the content>
last_reviewed: 2026-11-06 # YYYY-MM-DD
---
```

| Spec status | Meaning |
|---|---|
| Draft | Written, not yet reviewed. Reverse-engineered specs start here. |
| In Review | Open PR or stakeholder review in progress. |
| Approved | Reviewed and accepted by the owner and a product stakeholder. It is the source of truth. |
| Deprecated | Kept for history; superseded (say by what in the Overview). |

`domain` and `feature` specs must contain the mandatory `##` sections listed in
`registry.json` → `requiredSections` **(enforced)**. Section numbering such as
`## 4. Functional Requirements` is allowed.

## 2. Requirement identifiers

Format **(enforced)**: `<PREFIX>-<TYPE>-<NNN>`, for example `CALL-BR-004`.

- **PREFIX**: 2–8 upper-case letters or digits, registered in `registry.json` with the
  single spec file that may define it **(enforced)**.
- **TYPE**: one of the codes below.
- **NNN**: three digits, allocated in order within a prefix and type, and **never reused**.
  A withdrawn requirement keeps its row with status `Deprecated`.

| Type | Use for |
|---|---|
| FR | Functional requirement: something the system does |
| BR | Business rule: a constraint, formula, threshold or option list |
| NFR | Non-functional: performance, offline behaviour, reliability, usability |
| SEC | Security or privacy requirement |
| DATA | Data model or storage requirement |
| INT | Integration with an external system or device capability |
| API | Client-side API contract obligation (the contract itself is in `specs/api/openapi.json`) |
| AC | Acceptance criterion |
| TC | Test case |
| GAP | Known gap, defect, ambiguity or open question |

IDs are unique across the whole repository **(enforced)**.

**External IDs.** The prefix `DOC` belongs to the backend specification of Doctor
Information Gathering (FEAT-doctor-info-gathering). The app's code comments cite those IDs.
They are registered under `external` and may be referenced, but not defined, here
**(enforced)**.

## 3. Requirement tables

Requirements are defined in Markdown tables whose first column is `ID`. Required columns
depend on the ID type **(enforced)**:

| Defines | Required columns |
|---|---|
| FR, BR, NFR, SEC, DATA, INT, API | ID, Requirement, Status, Implementation, Verification |
| AC | ID, Criterion, Verifies |
| TC | ID, Scenario, Expected, Verifies |
| GAP | ID, Observation, Status |

Example:

```markdown
| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CALL-BR-001 | Arrival is "within vicinity" when the rep is ≤ 50 m from the day or evening clinic. | Implemented | `lib/location/distance.ts` | CALL-TC-003 |
```

### 3.1 Requirement status (current vs intended behaviour)

| Status | Meaning |
|---|---|
| Implemented | The code does this, and intent is evidenced. Evidence is an explicit design comment, the User Manual, or stakeholder confirmation. |
| Partial | Intended, but the code only partly does it. A GAP row must explain the difference. |
| Unconfirmed | The code does this, but nobody has confirmed it is intended. Treat it as current behaviour, not as a requirement to preserve, until a stakeholder confirms it. |
| Planned | Intended and approved, not built yet. |
| Deprecated | No longer required; kept so the ID is never reused. |

Reverse-engineered behaviour is never silently promoted to `Implemented`. If intent is
unknown, the status is `Unconfirmed`.

GAP status: `Open` (needs a decision), `Confirmed` (agreed to be a defect, not fixed yet),
`Resolved` (fixed or answered; say how), or `Accepted` (intended or tolerated; say why).

### 3.2 Implementation and Verification cells

- **Implementation** lists repository paths in backticks, for example `api/calls.ts`.
  Every path must exist **(enforced)**. `path:line` and `path#L12` are accepted, but prefer
  file paths, because line numbers drift. Only `Planned` and `Deprecated` rows may leave it
  empty **(enforced)**.
- **Verification** lists automated test files in backticks (each must exist **(enforced)**)
  or test-case IDs such as `CALL-TC-003` (each must be a defined TC or AC **(enforced)**).
  A requirement with neither produces a warning.

### 3.3 References

Any ID written in prose or a table cell is a reference and must resolve to a definition
**(enforced)**. IDs inside inline code (`like-this`) are treated as examples and ignored.

Code comments may cite requirement IDs. The validator scans `app/`, `api/`,
`components/`, `config/`, `constants/`, `hooks/`, `lib/`, `providers/` and `views/`. A cited
ID must exist, unless its prefix is external **(enforced)**. Citing the ID next to the code
that implements a rule is the recommended way to keep code and spec linked.

## 4. Traceability

Traceability runs in both directions:

1. **Spec → code**: the Implementation column.
2. **Spec → tests**: the Verification column, which names automated tests and/or TC rows. TC
   rows point back with their Verifies column.
3. **Code → spec**: requirement IDs cited in code comments, which the validator checks.
4. **API → spec**: each operation in `specs/api/openapi.json` lists the requirements it
   serves in `x-requirements`, which the validator checks.

`npm run specs:matrix` regenerates
[`traceability/matrix.md`](traceability/matrix.md) from the specs. CI fails if it is stale.

## 5. API contracts

`specs/api/openapi.json` (OpenAPI 3.0, JSON so the validator needs no YAML parser)
documents every endpoint the app calls. The validator:

- checks the document's structure (version, info, unique `operationId`s, responses,
  declared path parameters, resolvable `$ref`s);
- checks that every `x-requirements` ID resolves;
- extracts every `axios.<method>('/path')` call from the source. A call missing from the
  contract is an error. A documented operation the app no longer calls is a warning.

## 6. Tooling requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SFR-FR-001 | The validator reports specs with missing or invalid front matter. | Implemented | `scripts/specs/validate-specs.mjs` | `scripts/specs/validate-specs.test.mjs` |
| SFR-FR-002 | The validator reports domain/feature specs and the feature template that lack a mandatory section. | Implemented | `scripts/specs/validate-specs.mjs`, `specs/registry.json` | `scripts/specs/validate-specs.test.mjs` |
| SFR-FR-003 | The validator reports malformed requirement IDs, unregistered prefixes, IDs defined outside their prefix's spec, and duplicate IDs. | Implemented | `scripts/specs/validate-specs.mjs` | `scripts/specs/validate-specs.test.mjs` |
| SFR-FR-004 | The validator reports requirement rows with an unknown status, missing columns, or Implementation/Verification paths that do not exist. | Implemented | `scripts/specs/validate-specs.mjs` | `scripts/specs/validate-specs.test.mjs` |
| SFR-FR-005 | The validator reports references, in specs or in source comments, to IDs that are not defined; external prefixes are exempt. | Implemented | `scripts/specs/validate-specs.mjs` | `scripts/specs/validate-specs.test.mjs` |
| SFR-FR-006 | The validator checks the OpenAPI contract's structure and `x-requirements`, and fails when the app calls an endpoint the contract does not document. | Implemented | `scripts/specs/validate-specs.mjs`, `specs/api/openapi.json` | `scripts/specs/validate-specs.test.mjs` |
| SFR-FR-007 | The traceability matrix is generated from the specs, and CI fails when the committed copy is stale. | Implemented | `scripts/specs/validate-specs.mjs`, `.github/workflows/specs.yml` | `scripts/specs/validate-specs.test.mjs` |
| SFR-NFR-001 | Every message names the file, line (where known), rule code and the problem. The exit code is non-zero on errors, and also on warnings with `--strict`. | Implemented | `scripts/specs/validate-specs.mjs` | `scripts/specs/validate-specs.test.mjs` |
| SFR-NFR-002 | The validator runs with plain Node.js (≥ 20) and no npm dependencies, locally and in CI. | Implemented | `scripts/specs/validate-specs.mjs`, `package.json` | SFR-TC-001 |

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| SFR-TC-001 | On a clean checkout with no `node_modules`, run `node scripts/specs/validate-specs.mjs`. | Completes and prints a summary; no module-resolution errors. | SFR-NFR-002 |

## 7. Commands

| Command | What it does |
|---|---|
| `npm run specs:validate` | Validate specs, IDs, references and the API contract, and check the matrix is current |
| `npm run specs:matrix` | Regenerate `specs/traceability/matrix.md` |
| `npm run specs:test` | Run the validator's own tests |
