---
id: SPEC-PRODUCT-OVERVIEW
title: Product Overview — Searle E-Detailing Mobile App
type: product
status: Draft
owner: Product owner (to be confirmed)
last_reviewed: 2026-11-06
---

# Product Overview

> Synthesised from the code and the User and Training manuals. Needs product-owner review; it
> describes the product as built, not a new vision.

## 1. Purpose

Searle's field force (Territory Sales Officers / Medical Information Executives) visit doctors to
promote products ("detailing"). The app replaces paper call reports with **e-detailing**:
- The rep presents an approved digital slide deck to the doctor.
- The app records the visit with location, time per slide, feedback and samples.
- The office gets accurate coverage and engagement data.

The app also lets reps:
- profile their doctors,
- log patients they have put on therapy,
- see their call and sales performance.

## 2. Users

| Actor | Needs |
|---|---|
| Medical Rep (TSO/MIE) | The day's doctors, the right slides, quick call recording, working offline, seeing their own performance |
| Managers (RM/SM/HOS/NSM) | Join calls (recorded as joint calls); consume reports outside the app |
| Head office / admin | Manage content and permissions; read usage, call and sales reports (admin console) |

## 3. Capabilities

| Capability | Dashboard card / tab | Domain spec |
|---|---|---|
| Sign in, including offline | — | [auth.md](../domains/auth.md) |
| Feature access per role | Dashboard | [permissions.md](../domains/permissions.md) |
| Daily download for offline use | Settings › Offline Data | [sync.md](../domains/sync.md) |
| Report calls (Chamber, Walking, Group), cancel, review | e-Detailing; Doctors | [calls.md](../domains/calls.md) |
| Profile assigned doctors | Doctor Info | [doctor-info.md](../domains/doctor-info.md) |
| Log patients and prescriptions | Patients | [patients.md](../domains/patients.md) |
| Browse slides and product book | Content; Portfolio | [content.md](../domains/content.md) |
| Call and sales performance, PDF | Analytics | [analytics.md](../domains/analytics.md) |
| Usage and crash reporting | — | [telemetry.md](../domains/telemetry.md) |

## 4. Product principles (evidenced in the User Manual)

1. **No signal is not a problem.** Everything works offline after a sync, and nothing recorded is
   lost (see CALL-GAP-001 for the one known exception).
2. **ARRIVED before START.** Every call is anchored to a GPS position; walking away after ARRIVED
   is recorded as a cancellation.
3. **The deck is decided centrally** by doctor (or specialty for group calls), not chosen by the
   rep.
4. **The monthly visit quota by doctor class** drives what the rep should do next.

## 5. Out of scope (today)

- Tour planning; content authoring; manager dashboards; push notifications.
- The FAQs, AI Trainer and Explore screens are placeholders (PERM-GAP-002).

## 6. Glossary

| Term | Meaning |
|---|---|
| TSO / MIE | The field rep. `mieId` = `tso_staff.tsoid`. |
| Planned doctors | Doctors assigned to the rep, with a class |
| Class (A1…A4) | Doctor priority for this rep; sets the monthly visit quota |
| Forcing content | The slide deck the office forces for a doctor's specialty, ordered by `forcing` |
| Chamber / Walking / Group | Call types; Walking is stored as `parking` |
| Joint call | A manager accompanied the rep (RM, SM, HOS, NSM) |
| PMDC | Pakistan Medical & Dental Council registration number |
| Brick | Sales territory unit |
| GOLM | Growth over last month (sales %) |
| RFI | Caption on the Call / Planned % card (expansion to be confirmed) |
