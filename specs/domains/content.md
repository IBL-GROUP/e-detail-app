---
id: SPEC-DOMAIN-CONT
title: Content Library and Portfolio
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Content Library and Portfolio

> Reverse-engineered from the code at commit `e4f6eda`. The slide decks *played in a call* are
> covered in [calls.md](calls.md); this spec covers browsing.

## 1. Overview

Two read-only screens. **Content** shows the slide images of every brand and SKU assigned to
the rep's team, so the rep can preview what they present. **Portfolio** lists the rep's whole
product book: every brand and SKU they carry, not only what is currently being promoted.

## 2. Goals and Scope

**In scope:** the Content and Portfolio screens and their offline availability.
**Out of scope:** managing content, which is done in the admin console (`e-detail-admin-fe`).

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Browses content (`CONTENT`) and portfolio (`PORTFOLIO`). |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CONT-FR-001 | Content shows one card per team brand (`GET /content/team-brands`). The summary reads "{n} brands \| {n} SKUs". Each card has a preview of up to 3 images (with "+N" for more), a count of SKUs ("Brand-wise content" when none) and images, and SKU pills. A card with no images is disabled. | Implemented | `views/content-library/index.tsx`, `views/content-library/BrandCard.tsx`, `api/content.ts` | CONT-TC-001 |
| CONT-FR-002 | Tapping a brand opens a full-screen, view-only image carousel with a filmstrip and an "{i} / {n}" counter. | Implemented | `views/content-library/BrandImageViewer.tsx` | CONT-TC-001 |
| CONT-FR-003 | Portfolio lists the rep's brands and their SKUs from the product book (`GET /content/mie-brands`), not from the forcing table. | Implemented | `views/my-brands/index.tsx`, `api/content.ts` | CONT-TC-002 |
| CONT-FR-004 | Both screens work offline. Team brands are seeded by the daily sync and their images are downloaded to the phone. | Implemented | `lib/offline/runSync.ts`, `lib/offline/imageCache.ts` | CONT-TC-003 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CONT-BR-001 | SKU display names drop a leading brand name (case-insensitive) unless nothing would remain. | Unconfirmed | `lib/skuName.ts` | CONT-TC-002 |
| CONT-BR-002 | Grids use 3 columns at ≥ 1000 px width, 2 at ≥ 640 px, otherwise 1. | Unconfirmed | `views/content-library/index.tsx`, `views/my-brands/index.tsx` | CONT-TC-001 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CONT-DATA-001 | `TeamBrand {brandId, brandName, forcing, slideCount, slideUrls[], skus[]}` and `MieBrand {brandId, brandName, skus[{skuId, skuName}]}`; schemas in [openapi.json](../api/openapi.json). Cached for 30 minutes before refetch. | Implemented | `api/content.ts` | CONT-TC-002 |

## 7. API and Interface Contracts

Operations `getTeamBrands`, `getMieBrands` and `getSpecialties` in [openapi.json](../api/openapi.json).

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Fetch fails, nothing cached | Error state | "Unable to load content" / "Unable to load your brands." |
| No brands | Empty state | "No content assigned" / "No brands assigned to you yet." |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| CONT-SEC-001 | Content is read-only in the app; no create, update or delete call exists. | Implemented | `api/content.ts` | CONT-TC-001 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| CONT-AC-001 | Given a completed sync, when the rep opens Content in airplane mode, then every brand's images display. | CONT-FR-001, CONT-FR-004 |

## 11. Testing Requirements

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| CONT-TC-001 | Open Content online; open a brand with more than 3 images. | Cards, counts, "+N", carousel and counter as specified. | CONT-FR-001, CONT-FR-002, CONT-BR-002, CONT-SEC-001 |
| CONT-TC-002 | Open Portfolio. | Brands and SKU pills, with the brand prefix stripped from SKU names. | CONT-FR-003, CONT-BR-001, CONT-DATA-001 |
| CONT-TC-003 | Sync, then airplane mode, then open Content and Portfolio. | Both render fully. | CONT-FR-004 |

## 12. Dependencies

- Backend `/content/team-brands`, `/content/mie-brands`; content is managed in the admin console.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| CONT-GAP-001 | Cards print the server's `slideCount`, while the preview and viewer use `slideUrls`, so the two can disagree. The viewer counter repeats itself ("2 / 5 · Image 2"). | Open |
| CONT-GAP-002 | ID types are inconsistent: `TeamBrandSku.skuId` is a number but `MieSku.skuId` is a string. Confirm the backend types. | Open |
