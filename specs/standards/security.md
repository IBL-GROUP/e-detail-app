---
id: SPEC-STD-SECURITY
title: Security and Privacy Standard
type: standard
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Security and Privacy Standard

This standard covers the cross-cutting security requirements and the known risks. Domain-specific security
rows live in each domain spec (search for `-SEC-`). The app handles rep credentials, doctor
personal data (PMDC identity, phone numbers) and **patient health data** (prescriptions).

## 1. Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| SECR-SEC-001 | Every API route requires `Authorization: Bearer <token>`, except `/auth/login` and the two shared-key bootstrap routes (`/auth/offline-users`, `/doctor/planned-all`). Those two use `x-app-key` instead. | Implemented | `config/axios.ts`, `config/app-sync.ts` | SECR-TC-001 |
| SECR-SEC-002 | Device permissions (location while in use, camera, photos) are requested at the moment of use, with a purpose string. | Implemented | `app.json`, `lib/location/captureArrival.ts`, `views/patients/AttachmentPicker.tsx`, `views/doctor-profiles/VisitingCardPicker.tsx` | SECR-TC-002 |
| SECR-SEC-003 | Secrets that must persist on the device (a queued password change) go in SecureStore, never in plain files. See AUTH-SEC-001. | Implemented | `lib/auth/pendingPasswordChange.ts` | AUTH-TC-010 |
| SECR-SEC-004 | `EXPO_PUBLIC_*` values are compiled into the app bundle and are **not secrets**. Real secrets must never be put in them. | Implemented | `config/app-sync.ts`, `config/api-base-url.ts` | SECR-TC-001 |
| SECR-SEC-005 | Client-side permission codes hide UI only. Authorisation is the backend's job (see PERM-SEC-001). | Implemented | `lib/auth/permissions.ts` | PERM-TC-003 |

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| SECR-TC-001 | Proxy the app traffic (sandbox) and exercise sign-in, sync and a call upload. | Bearer header on every route except the three listed; `x-app-key` only on the two bootstrap routes. | SECR-SEC-001, SECR-SEC-004 |
| SECR-TC-002 | Fresh install: use ARRIVED, add a patient photo and a visiting card. | Each permission prompt appears only when that feature is first used, with its purpose text. | SECR-SEC-002 |

## 2. Known risks (gaps)

| ID | Observation | Status |
|---|---|---|
| SECR-GAP-001 | **Cleartext HTTP is allowed.** On Android `usesCleartextTraffic` is true, on iOS `NSAllowsArbitraryLoads` is true, and the sandbox API URL is `http://`. Passwords, tokens and patient data cross the network unencrypted wherever HTTP is used. Confirm whether production uses HTTPS. | Open |
| SECR-GAP-002 | `.env` is committed to git; only `.env*.local` is ignored. It holds internal API addresses and the offline sync key. These are public in the bundle anyway (SECR-SEC-004), but committing `.env` invites real secrets to follow. | Open |
| SECR-GAP-003 | Every request URL and response status is logged with `console.log` in all builds, including production (`config/axios.ts`). Query strings carry `mieId` and doctor ids. | Open |
| SECR-GAP-004 | Bulk data on every device behind a shared key: every active user's password hash (AUTH-GAP-001) and every rep's planned list (SYNC-GAP-004). | Open |
| SECR-GAP-005 | Separation between reps on a shared phone is partial. Some local data is not filtered by rep: call merges (CALL-GAP-004), patients (PAT-GAP-002), profile uploads (DINFO-GAP-002) and images (SYNC-GAP-005). | Open |
| SECR-GAP-006 | Session token and credential hash are stored in plain files (AUTH-GAP-002). | Open |
| SECR-GAP-007 | Data screens are reachable by deep link without their permission, and the endpoints do not check permission codes (PERM-GAP-001). | Open |
