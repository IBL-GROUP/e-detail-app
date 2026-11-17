---
id: SPEC-PROCESS-WORKFLOW
title: Specification-First Development Workflow
type: process
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Specification-First Development Workflow

**Rule:** the spec changes first, then the code, then the verification. A behaviour change that
is not in a spec is not done.

```
 ① Specify  →  ② Review spec  →  ③ Implement  →  ④ Verify  →  ⑤ Merge (spec + code + matrix)
```

## 1. When a spec change is required

| Change | Spec work needed |
|---|---|
| New feature or screen | New feature spec in `specs/features/` (from the template), approved **before** implementation starts |
| Change to existing behaviour (a rule, value, message, flow, API field, storage) | Edit the owning domain spec's rows **in the same PR**, before or with the code |
| New or changed endpoint or field | Update `specs/api/openapi.json` and the `x-requirements` on the operation |
| Bug fix that restores specified behaviour | None, but cite the requirement ID in the PR. If the bug was a `GAP`, mark it `Resolved`. |
| Bug fix where the "correct" behaviour was never specified | Add or adjust the requirement first; this *is* a behaviour decision |
| Refactor, styling, dependency bump with no behaviour change | None. Say "no behaviour change" in the PR. |
| Hard-to-reverse technical decision | An ADR in `specs/architecture/decisions/` |

"Significant" feature work, meaning anything that adds a screen, an endpoint, a stored field, or
a rule a rep or the office would notice, needs its spec **approved** (status `Approved`) before
coding starts. Small changes may carry the spec edit in the same PR as the code.

## 2. Creating a feature spec (step by step)

1. `cp specs/templates/feature-spec.md specs/features/<feature-slug>.md`
2. In the front matter, set `id: SPEC-FEAT-<SLUG>`, `type: feature`, `status: Draft`, the owner,
   and today's date. Delete the `template_for` line.
3. Choose a prefix (2–8 capitals, not already in `specs/registry.json`) and add it:
   ```json
   "TOUR": { "name": "Tour planning", "spec": "specs/features/tour-planning.md" }
   ```
4. Fill every section. Replace `XXX` with your prefix. Rules:
   - one behaviour per row; exact values (numbers, messages, option lists);
   - new rows are `Planned`;
   - anything undecided goes in **Known Gaps and Open Questions** as an `Open` GAP. **Do not guess.**
5. Add or extend the endpoints in `specs/api/openapi.json` with `x-requirements`.
6. Write the TC rows (scenario, expected, which IDs they verify) and the AC rows.
7. Run `npm run specs:validate` and fix every error.
8. Open a PR titled `spec: <feature>` and request review (§4). Set the spec to `In Review`.
9. Once approved, set `status: Approved` and add a Change Log row. Implementation can begin.

## 3. Implementing and updating

1. Read the spec rows you are implementing. Cite their IDs in commit messages, and in code
   comments next to non-obvious rules (for example `// CALL-BR-001: 50 m vicinity`).
2. When a row ships, set its Status to `Implemented` and fill **Implementation** with the file
   paths.
3. Put automated tests in **Verification**. Until then, list the TC IDs, which are executed
   manually.
4. If implementation reveals the spec is wrong or incomplete, **stop and update the spec**
   (and get it re-reviewed if the change is material). Don't let code and spec diverge.
5. Changing existing behaviour means editing the row in place. Removing a behaviour means status
   `Deprecated`. **Never reuse or renumber an ID.**
6. Run `npm run specs:matrix` and commit the regenerated `specs/traceability/matrix.md`.
7. Run `npm run specs:validate`, `npm run specs:test` and `npm run lint`.

## 4. Review

| Reviewer | Checks |
|---|---|
| Spec owner (tech lead) | Structure, IDs, feasibility, API contract, security section |
| Product stakeholder | Rules, messages and scope are what the business wants; GAPs answered |
| Code reviewer | Code matches the cited rows exactly; tests or TCs cover them; matrix regenerated; no undocumented rule added |

The PR template (`.github/pull_request_template.md`) carries this checklist. The CI workflow
`Specs` must pass.

## 5. Keeping specs, code and tests consistent

- The validator fails CI on broken IDs, references, paths, contract drift and a stale matrix.
- `Unconfirmed` rows are current behaviour whose intent is unknown. Before changing one, confirm
  intent with the product stakeholder, then mark it `Implemented` (kept) or change it.
- A `GAP` is resolved by a decision. Record the decision in the GAP row (`Resolved` / `Accepted`
  and why), then update the affected requirement rows.
- Every review cycle, update `last_reviewed` on the specs you touched.

## 6. Where things live

See [specs/README.md](../README.md) for the index, and [CONVENTIONS.md](../CONVENTIONS.md) for
ID, status and table rules.
