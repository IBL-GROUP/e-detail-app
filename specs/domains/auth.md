---
id: SPEC-DOMAIN-AUTH
title: Authentication and Session
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Authentication and Session

> Reverse-engineered from the code at commit `e4f6eda` (branch `merge/doctor-info-gathering`).
> Status `Draft` until reviewed. See [CONVENTIONS](../CONVENTIONS.md) for ID and status meanings.

## 1. Overview

Field reps (TSO/MIE) sign in with their employee number and password. The app must work
offline, so it can sign a rep in against on-device data when the server is unreachable. Such
an *offline session* can use cached data but cannot sync until it is upgraded to a real server
session. This spec also covers session persistence and expiry, sign-out, and password change
(online and queued offline).

## 2. Goals and Scope

**In scope:** sign-in (online and offline), the on-device login mirror, session persistence
and expiry, 401 handling, sign-out, and password change.
**Out of scope:** what a signed-in rep may see, which is covered by [permissions.md](permissions.md),
and server-side authentication, which is owned by the backend.

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | A TSO/MIE. The only role the app surfaces (`rep`). |
| Backend auth service | `POST /auth/login`, `/auth/offline-users`, `/auth/change-password` (see [openapi.json](../api/openapi.json)). |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| AUTH-FR-001 | The rep signs in with their employee number. If the input has no `@`, the app appends the company domain (`EXPO_PUBLIC_LOGIN_EMAIL_DOMAIN`, default `@ff.searlecompany.com`); otherwise it uses the input as typed. | Implemented | `providers/AuthProvider.tsx`, `app/login.tsx` | AUTH-TC-001 |
| AUTH-FR-002 | Online sign-in calls `POST /auth/login` with a 12 s timeout. The sign-in fails unless the response has `success`, `user` and `token`, and the user has both `mieId` and `teamId`. Without those it shows "This account is not registered as a field rep (MIE)…". | Implemented | `providers/AuthProvider.tsx` | AUTH-TC-001, AUTH-TC-002 |
| AUTH-FR-003 | The app falls back to offline sign-in only when the server cannot be reached (no HTTP response, or the device reports it is offline). A 401/403 from the server is shown as an error and never falls back. Offline sign-in checks, in order: (1) the login mirror (bcrypt); (2) this device's last online user (salted hash). If both fail, it shows "You appear to be offline and no saved login was found on this device…". | Implemented | `providers/AuthProvider.tsx`, `lib/offline/offlineUsers.ts`, `lib/offline/offlineAuth.ts` | AUTH-TC-003, AUTH-TC-004 |
| AUTH-FR-004 | An offline session holds a placeholder token `offline-<userId>-<timestamp>` that is never sent to the API. While it lasts, the app retries the real sign-in every 30 s and on reconnect, using the credentials typed this session (held in memory only). A network failure keeps the offline session. A server rejection ends it (reason `credentials_rejected`). After an app restart it cannot upgrade itself, and the rep must sign in again to sync. | Implemented | `providers/AuthProvider.tsx`, `lib/auth/tokenStore.ts` | AUTH-TC-005 |
| AUTH-FR-005 | On app open the app downloads the active-user login mirror (`POST /auth/offline-users`, header `x-app-key`, 8 s timeout). It skips the download when the device is offline. Sign In waits for the download only when the device holds no mirror yet. | Implemented | `providers/AuthProvider.tsx`, `config/app-sync.ts` | AUTH-TC-003 |
| AUTH-FR-006 | The session (token and user) persists across restarts. On launch, a stored JWT that has expired (or expires within 30 s) is discarded and the rep is sent to sign-in. An offline placeholder is exempt from this expiry check. | Implemented | `providers/AuthProvider.tsx`, `lib/auth/tokenStore.ts`, `app/_layout.tsx` | AUTH-TC-006 |
| AUTH-FR-007 | Only a 401 whose body `code` is `TOKEN_EXPIRED`, `TOKEN_INVALID` or `TOKEN_MISSING` ends the session, and never for `/auth/login`. In an offline session such a 401 triggers a sign-in retry instead. Any other 401 (for example a wrong `x-app-key`) keeps the session. | Implemented | `config/axios.ts` | AUTH-TC-007 |
| AUTH-FR-008 | Sign-out (by the rep, on token expiry, or on credential rejection) clears only the session. It keeps all offline data: query cache, images, call/patient/profile queues, login mirror and planned bulk. | Implemented | `providers/AuthProvider.tsx` | AUTH-TC-007, AUTH-TC-008 |
| AUTH-FR-009 | Online password change calls `POST /auth/change-password` with `{userId, username, currentPassword, newPassword}`. A server refusal shows the server's message. On success the on-device credentials switch to the new password. | Implemented | `providers/AuthProvider.tsx`, `app/(tabs)/settings.tsx` | AUTH-TC-009 |
| AUTH-FR-010 | Offline password change works as follows. The current password is checked against the on-device copies. The new password takes effect for offline sign-in immediately. The change is queued and sent once a real session exists, and again on reconnect. If the server accepts, the rep sees "Password updated". If it refuses, the device reverts to the old password and explains why. One change is queued at a time; a second change keeps the original current password. | Implemented | `providers/AuthProvider.tsx`, `lib/auth/pendingPasswordChange.ts` | AUTH-TC-010 |
| AUTH-FR-011 | While an offline change is queued, signing in online with the new password retries with the queued old password; the queue then delivers the new one. | Implemented | `providers/AuthProvider.tsx` | AUTH-TC-010 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| AUTH-BR-001 | Password change form rules, in order: current password required ("Enter your current password."); new password at least 6 characters; confirmation must match; new must differ from current. | Unconfirmed | `app/(tabs)/settings.tsx` | AUTH-TC-009 |
| AUTH-BR-002 | Only users resolving to an MIE (`mieId`) and a team (`teamId`) may use the app; the role shown is always "Medical Rep". | Implemented | `providers/AuthProvider.tsx` | AUTH-TC-002 |
| AUTH-BR-003 | A mirror record with `accountLocked = true` cannot sign in offline. Identifiers match case-insensitively on user name or email. | Unconfirmed | `lib/offline/offlineUsers.ts` | AUTH-TC-003 |
| AUTH-BR-004 | Token lifetime is set by the server (the JWT `exp` claim). Code comments say the token expires at the end of Sunday (Asia/Karachi). The app does not refresh tokens. | Unconfirmed | `lib/auth/tokenStore.ts` | AUTH-TC-006 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| AUTH-DATA-001 | `AuthUser` = `{userId, username, name, email?, role:'rep', team?, mieId (string, tso_staff.tsoid), teamId (number)}`. | Implemented | `providers/AuthProvider.tsx` | AUTH-TC-001 |
| AUTH-DATA-002 | Storage. Session: `documentDirectory/e-detail-app-session.json` (web: `localStorage` `e_detail_app_session`). Last-user credential: `e-detail-app-offline-cred.json` (salt and SHA-256 hash). Login mirror: `e-detail-app-offline-users.json` (server bcrypt hashes). Pending password change: SecureStore key `e_detail_pending_password_change` (web: `sessionStorage`). | Implemented | `providers/AuthProvider.tsx`, `lib/offline/offlineAuth.ts`, `lib/offline/offlineUsers.ts`, `lib/auth/pendingPasswordChange.ts` | AUTH-TC-008 |

## 7. API and Interface Contracts

Operations `login`, `getOfflineUsers` and `changePassword` in [openapi.json](../api/openapi.json).

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| AUTH-API-001 | Every request carries `X-Client: e-detail-app` and `X-App-Version`. Requests carry `Authorization: Bearer <token>` when a server token exists. Default timeout is 30 s. | Implemented | `config/axios.ts` | AUTH-TC-001 |
| AUTH-API-002 | The API base URL is `EXPO_PUBLIC_API_BASE_URL` for deployed builds. In development it is derived from the Metro host (Android emulator: `10.0.2.2`), falling back to `EXPO_PUBLIC_NATIVE_API_BASE_URL` / `EXPO_PUBLIC_LOCAL_API_BASE_URL`. | Implemented | `config/api-base-url.ts` | AUTH-TC-001 |

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Wrong credentials (server reachable) | No offline fallback | Server `message`, or "Invalid username or password" |
| Server unreachable, no device login | Sign-in refused | "You appear to be offline and no saved login was found on this device. Connect to the internet to sign in the first time." |
| Token expired mid-session | Session ends; queued work kept | Rep returned to sign-in |
| Offline password change, wrong current | Refused | "Current password is incorrect." |
| Queued password change refused later | Device reverts to old password | "Password change not applied" + server reason |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| AUTH-SEC-001 | Plaintext passwords are never written to plain app storage. The one exception is a queued offline password change, whose current and new passwords are kept in the OS keychain (SecureStore) until the server answers. | Implemented | `lib/auth/pendingPasswordChange.ts`, `lib/offline/offlineAuth.ts` | AUTH-TC-010 |
| AUTH-SEC-002 | The offline placeholder token is never sent to the API. | Implemented | `config/axios.ts`, `lib/auth/tokenStore.ts` | AUTH-TC-005 |
| AUTH-SEC-003 | Credentials typed for an offline sign-in are held in memory only, and are cleared on upgrade or sign-out. | Implemented | `providers/AuthProvider.tsx` | AUTH-TC-005 |

Cross-cutting security concerns are in [security.md](../standards/security.md).

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| AUTH-AC-001 | Given a rep with a valid account and network, when they enter their number and password, then they reach the dashboard, and the next app launch skips sign-in. | AUTH-FR-001, AUTH-FR-002, AUTH-FR-006 |
| AUTH-AC-002 | Given the server is unreachable and the device holds the login mirror, when a rep signs in with the right password, then they get an offline session that never calls the API with a token. When the network returns, it upgrades within about 30 s. | AUTH-FR-003, AUTH-FR-004, AUTH-SEC-002 |
| AUTH-AC-003 | Given a signed-in rep with queued calls, when their token expires, then they are signed out and their queued calls upload after the next sign-in. | AUTH-FR-007, AUTH-FR-008 |

## 11. Testing Requirements

There are no automated tests for this domain yet (see [migration-plan.md](../process/migration-plan.md)). Manual cases:

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| AUTH-TC-001 | Online, sign in with a numeric ID and the correct password. | Dashboard shown; request goes to `/auth/login` with `<id>@ff.searlecompany.com`; headers include `X-Client`. | AUTH-FR-001, AUTH-FR-002, AUTH-DATA-001, AUTH-API-001, AUTH-API-002 |
| AUTH-TC-002 | Sign in with an account that has no MIE or team. | "This account is not registered as a field rep (MIE)…" | AUTH-FR-002, AUTH-BR-002 |
| AUTH-TC-003 | Fresh install online (mirror downloads), then airplane mode, then sign in as another active rep. | Offline session starts. A locked account is refused. | AUTH-FR-003, AUTH-FR-005, AUTH-BR-003 |
| AUTH-TC-004 | Online, wrong password. | Error shown; no offline session created. | AUTH-FR-003 |
| AUTH-TC-005 | Offline session, then restore network without restarting. | Within about 30 s the session becomes online, sync runs, and no request carried an `offline-` token. | AUTH-FR-004, AUTH-SEC-002, AUTH-SEC-003 |
| AUTH-TC-006 | Set the device clock past the token `exp` and relaunch. | Sign-in screen shown. | AUTH-FR-006, AUTH-BR-004 |
| AUTH-TC-007 | With calls queued offline, make the backend return 401 `TOKEN_EXPIRED`. | Signed out; after sign-in the queued calls upload. A 401 without a token code keeps the session. | AUTH-FR-007, AUTH-FR-008 |
| AUTH-TC-008 | Sign out, go offline, sign in again. | Cached doctors, content and pending calls are still present. | AUTH-FR-008, AUTH-DATA-002 |
| AUTH-TC-009 | Change password online: (a) wrong current, (b) 5-character new, (c) valid. | (a) server message; (b) "Password must be at least 6 characters."; (c) "Password updated successfully." | AUTH-FR-009, AUTH-BR-001 |
| AUTH-TC-010 | Offline: change password, sign out, sign in with the new password (offline), then go online. | Offline sign-in accepts the new password. Online, "Password updated" is shown and the server accepts the new password. | AUTH-FR-010, AUTH-FR-011, AUTH-SEC-001 |

## 12. Dependencies

- Backend endpoints `/auth/login`, `/auth/offline-users`, `/auth/change-password`. The backend's `OFFLINE_SYNC_KEY` must match the app's `x-app-key`.
- `expo-secure-store`, `expo-crypto`, `bcryptjs`, `@react-native-community/netinfo`.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| AUTH-GAP-001 | The login mirror sends the bcrypt password hashes of **every active user** to every device. It is protected only by a shared key whose default is compiled into the app (`config/app-sync.ts`). A stolen device or an extracted APK exposes every user's hash to offline cracking. Owner: security / backend lead. | Open |
| AUTH-GAP-002 | The session file (including the bearer token) and the last-user credential hash are plain JSON in the app's documents directory, not in SecureStore. | Open |
| AUTH-GAP-003 | The Change Password button shows "Updating…" but is not disabled, so a double tap can submit twice. | Open |
| AUTH-GAP-004 | `userId` is sent as received (number or string) online, but always as a string from the offline queue. Confirm the backend accepts both. | Open |
| AUTH-GAP-005 | The server's password policy is unknown. The client enforces only "at least 6 characters" (AUTH-BR-001). Confirm the real policy. | Open |
