---
id: SPEC-DOMAIN-ANLY
title: Analytics and PDF Export
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Analytics and PDF Export

> Reverse-engineered from the code at commit `e4f6eda`.

## 1. Overview

Analytics shows a rep their call performance (calls against plan, coverage, reach, engagement
time, time per specialty, brand and slide) and sales performance (sales against target,
projection, growth, and breakdowns by brand, SKU, brick and chemist) for a chosen period. Call
figures include calls still on the phone. The screen works offline from saved figures and
exports a PDF report.

## 2. Goals and Scope

**In scope:** period selection, call and sales metrics, charts, offline fallback, the post-sync prefetch, and PDF export.
**Out of scope:** the per-doctor Call Report ([calls.md](calls.md)).

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Views their own analytics. Needs `ANALYTICS`. |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| ANLY-FR-001 | The period is a month plus a day range, defaulting to the 1st of the current month through today. Changing the month resets the range: 1st to today for the current month, otherwise the whole month. Dates are sent as local `YYYY-MM-DD`. | Implemented | `app/(tabs)/analytics.tsx` | ANLY-TC-001 |
| ANLY-FR-002 | Call Performance shows four cards: Call / Planned (with % "RFI"), Covered / Doctors, Reach (doctors who met their quota / doctors with a quota) and Avg Engagement Time (with change vs the preceding span). It also shows a Calls Completed current-vs-previous card and three charts: average engagement by specialty, average engagement by brand, and time per slide for one specialty at a time, in deck order. | Implemented | `app/(tabs)/analytics.tsx`, `lib/analytics/summaryMetrics.ts`, `api/calls.ts` | ANLY-TC-002 |
| ANLY-FR-003 | Sales Performance shows Monthly Target, Achievement %, Expected Sales for the Month and Total Sales (current, previous, GOLM growth %). It also shows Sales by Brand, SKU and Brick, each with its own Value/Units toggle, and the Top 10 Chemists. | Implemented | `app/(tabs)/analytics.tsx`, `api/sales.ts` | ANLY-TC-003 |
| ANLY-FR-004 | Offline, the screen uses figures saved for the same rep and month: the exact period if saved, otherwise the latest saved period that starts on the same day. Unsynced calls are added on top. A note explains this, or says that nothing is saved yet. | Implemented | `api/offlineFallback.ts`, `app/(tabs)/analytics.tsx` | ANLY-TC-004 |
| ANLY-FR-005 | After every successful sync, the app prefetches the current month's totals, engagement, slide engagement and sales, so Analytics works offline. | Implemented | `lib/offline/prefetchAnalytics.ts`, `providers/SyncProvider.tsx` | ANLY-TC-004 |
| ANLY-FR-006 | Export PDF builds an A4 report holding both sections, whatever view is selected. Each page has a header (title, view, reporting period) and a footer ("Page X of Y", generated time). It contains the metric cards, current-vs-previous figures and breakdown bars. Saved as `analytics-report-YYYY-MM-DD.pdf`; native opens the share sheet. | Implemented | `lib/analytics/exportPdf.ts`, `app/(tabs)/analytics.tsx` | ANLY-TC-005 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| ANLY-BR-001 | Planned calls = the sum of each assigned doctor's class quota for the month the period starts in (server). Call/Planned % = round(made / planned × 100); it is shown only when planned > 0, and is positive at ≥ 100%. | Implemented | `lib/analytics/summaryMetrics.ts`, `api/calls.ts` | ANLY-TC-002 |
| ANLY-BR-002 | Covered = distinct doctors called at least once in the period (server ids together with local calls); % = round(covered / assigned × 100). | Implemented | `lib/analytics/summaryMetrics.ts`, `lib/offline/localCallModels.ts` | ANLY-TC-002 |
| ANLY-BR-003 | Average engagement = total slide seconds / completed calls. Change = round((avg − previous avg) / previous avg × 100), shown only when both averages exist. | Implemented | `lib/analytics/summaryMetrics.ts` | ANLY-TC-002 |
| ANLY-BR-004 | Expected Sales = sales / days covered × days in month. Achievement is positive when it is at least the share of the month elapsed. Breakdowns drop zero values and sort descending on the selected measure. Units ≥ 100,000 display as "NK". | Unconfirmed | `app/(tabs)/analytics.tsx` | ANLY-TC-003 |
| ANLY-BR-005 | When `from`/`to` are omitted, every analytics endpoint defaults to the current calendar month (server behaviour). | Implemented | `api/calls.ts` | ANLY-TC-001 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| ANLY-DATA-001 | Query keys include rep and period (`from..to`), so each period is cached separately. Call figures are fresh for 5 minutes. Sales use stale time 0 and always refetch on mount, because the backend caches each period for 30 minutes. | Implemented | `api/calls.ts`, `api/sales.ts` | ANLY-TC-004 |

## 7. API and Interface Contracts

Operations `getMonthlyCallTotals`, `getEngagement`, `getSlideEngagement` and `getMieSalesSummary` in
[openapi.json](../api/openapi.json).

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| ANLY-API-001 | `GET /mie_sales/summary` uses a 180 s timeout, because the backend's cold warehouse query takes over a minute. | Implemented | `api/sales.ts` | ANLY-TC-003 |

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Offline, figures saved | Saved figures + local calls | "You are offline — showing the figures saved on this phone (as of …)…" |
| Offline, nothing saved | Placeholders | "…no figures for this month are saved on this phone yet. They will appear after your next sync." |
| PDF fails | — | "Export failed / Could not generate the PDF report. Please try again." |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| ANLY-SEC-001 | Analytics requests are scoped by the signed-in rep's `mieId`. The screen is gated by `ANALYTICS` (PERM-FR-004). | Implemented | `app/(tabs)/analytics.tsx` | ANLY-TC-002 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| ANLY-AC-001 | Given 10 completed calls against 40 planned, when the rep opens Analytics, then Call / Planned reads "10 / 40" with 25%. After one more call offline it reads "11 / 40" without a network. | ANLY-FR-002, ANLY-BR-001, ANLY-FR-004 |

## 11. Testing Requirements

`lib/analytics/summaryMetrics.ts` is pure and is the first candidate for unit tests. Manual cases:

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| ANLY-TC-001 | Change the month and the day range. | Range resets per ANLY-FR-001; requests carry `from`/`to`. | ANLY-FR-001, ANLY-BR-005 |
| ANLY-TC-002 | Compare the call cards with known backend data. | Values and % match ANLY-BR-001 to ANLY-BR-003. | ANLY-FR-002, ANLY-BR-001, ANLY-BR-002, ANLY-BR-003, ANLY-SEC-001 |
| ANLY-TC-003 | Open Sales; toggle Value/Units. | Cards and breakdowns per ANLY-BR-004; a slow response still completes. | ANLY-FR-003, ANLY-BR-004, ANLY-API-001 |
| ANLY-TC-004 | Sync, go offline the next day, open Analytics. | Yesterday's month figures shown with the offline note. | ANLY-FR-004, ANLY-FR-005, ANLY-DATA-001 |
| ANLY-TC-005 | Export PDF on Android and web. | A4 PDF with both sections; share sheet (native) or download (web). | ANLY-FR-006 |

## 12. Dependencies

- Backend `/calls/monthly-totals`, `/calls/engagement`, `/calls/slide-engagement`, `/mie_sales/summary` (warehouse via postgres_fdw).
- `jspdf`, `expo-sharing`, `react-native-gifted-charts`.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| ANLY-GAP-001 | In the PDF, a plan-progress figure of 100% or more (Call/Planned, Covered) is printed as a green "+105%" captioned "vs prev.", as if it were a period-on-period change. The "RFI" caption is lost. | Open |
| ANLY-GAP-002 | Labels say "Current Month / Previous Month" and "this month" even when the selected period is an arbitrary day range. The span labels on screen have identical branches. | Open |
| ANLY-GAP-003 | `api/sales.ts` comments contradict each other: the header says the source has no target, yet the type carries `targetValue` and `achievementPct`, and the query time is given as both ~70 s and ~100 s. Confirm where the monthly target comes from. | Open |
| ANLY-GAP-004 | The slide-engagement query is not refreshed when a call uploads, unlike the other call figures (`providers/OutboxProvider.tsx`). | Open |
| ANLY-GAP-005 | The PDF omits "Time Spent per Slide" and carries no rep name or ID. | Open |
| ANLY-GAP-006 | Two duration formats coexist ("14m" in the metric cards, "14m 0s" elsewhere). A "Call Volume vs Goal" chart with hard-coded data is hidden behind a flag. | Open |
