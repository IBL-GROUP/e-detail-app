---
id: SPEC-DOMAIN-PAT
title: Patient Log
type: domain
status: Draft
owner: E-Detailing app tech lead
last_reviewed: 2026-11-06
---

# Patient Log

> Reverse-engineered from the code at commit `e4f6eda`.

## 1. Overview

Reps record patients put on a product by a doctor. A record holds contact and address, the
prescribing doctor, the indication, dose and strengths, and at least one photo of the
prescription. The log is the rep's own; it is edited on the phone, saved locally first and
uploaded with its photos when online.

## 2. Goals and Scope

**In scope:** the patient list, add/edit form, validation, photos, offline queue and upload.
**Out of scope:** server-side storage (`patient_log` table).

## 3. Actors

| Actor | Description |
|---|---|
| Medical Rep | Records and edits their own patients. Needs `PATIENTS`. |

## 4. Functional Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PAT-FR-001 | The Patients screen lists the rep's whole log, fetched once and cached. Search covers patient, doctor, city and contact on the device; rows are shown 30 at a time. Not-yet-uploaded rows come first, then newest first. Each card shows contact, address, Oral/PFS, doctor and speciality, indication, dose, strengths M1–M3, and "View Prescription(s)". | Implemented | `views/patients/index.tsx`, `views/patients/PatientCard.tsx`, `api/patients.ts` | PAT-TC-001 |
| PAT-FR-002 | Add Patient and Edit (on any row) open the same form. Choosing a doctor fills the speciality, which stays editable. There is no delete. | Implemented | `views/patients/AddPatientModal.tsx` | PAT-TC-002 |
| PAT-FR-003 | Prescription photos can be taken with the camera or chosen from the library (several at a time); there are up to 5 per patient. Permission is requested at the moment of use. The full-screen viewer wraps around. | Implemented | `views/patients/AttachmentPicker.tsx`, `views/patients/ImageViewerModal.tsx` | PAT-TC-003 |
| PAT-FR-004 | Save writes to the device queue first; the list updates at once and the upload follows. On upload, photos go first (`POST /patients/attachments`); then rows are sent in batches of up to 50 (`POST /patients/batch`). | Implemented | `lib/offline/patientOutbox.ts`, `lib/offline/patientAttachments.ts`, `api/patients.ts` | PAT-TC-004 |

## 5. Business Rules

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PAT-BR-001 | Required: patient name, address, city, contact (complete), Oral/PFS, doctor, speciality, indication, dose, strength month 1, and at least one prescription photo. Strength months 2 and 3 are optional. | Implemented | `views/patients/AddPatientModal.tsx` | PAT-TC-002 |
| PAT-BR-002 | Maximum lengths: name 255, address 500, strength 50 (matching the database columns). Oral/PFS ∈ {Oral, PFS}. Indication ∈ {Diabetes, Weight loss, Thyroid, Anxiety, Depression, Insomnia}. City comes from the built-in list of Pakistani cities. | Unconfirmed | `views/patients/AddPatientModal.tsx`, `constants/pakistan-cities.ts` | PAT-TC-002 |
| PAT-BR-003 | Contact is entered as `+92-XXX-XXXXXXX`. It is complete with exactly 10 national digits; leading `00`, `92` and `0` are stripped. | Unconfirmed | `lib/phone.ts` | PAT-TC-002 |
| PAT-BR-004 | Dose options are the rep's SKUs (falling back to the team's SKUs). Speciality options are the rep's specialities (falling back to those on cached doctors). | Unconfirmed | `views/patients/index.tsx` | PAT-TC-002 |

## 6. Data Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PAT-DATA-001 | A new patient gets a client UUID (`client_patient_id`); the server upserts on it. Editing a legacy row without a client id sends its `s_no`. `mie_id` and `mie_name` are filled by the server from the token. | Implemented | `lib/offline/patientOutbox.ts`, `api/patients.ts` | PAT-TC-004 |
| PAT-DATA-002 | Queue: SQLite table `patient_outbox` (web: `localStorage` `e_detail_patient_outbox`). Photos are copied to `documentDirectory/patient-attachments/` until uploaded. Synced rows are pruned after 90 days. | Implemented | `lib/offline/patientOutboxStore.ts`, `lib/offline/patientOutboxStore.web.ts`, `lib/offline/patientAttachments.ts` | PAT-TC-004 |

## 7. API and Interface Contracts

Operations `getPatients`, `postPatientsBatch` and `uploadPatientAttachment` in [openapi.json](../api/openapi.json).

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PAT-API-001 | Retry policy is the same as for calls. A per-item 4xx counts as a rejection and the row is removed after 5. A 5xx, a missing status or a network error retries without limit. If any photo upload fails, the whole row is held. | Implemented | `lib/offline/patientOutbox.ts` | PAT-TC-005 |

## 8. Error Handling

| Condition | Behaviour | User message |
|---|---|---|
| Validation | Errors shown after the first Save attempt | e.g. "A prescription photo is required.", "Enter the full number." |
| Local write fails | Not saved | "Could not save this patient on the device. Please try again." |
| Photo pick fails | — | "Could not add the prescription / Please try again." |

## 9. Security Requirements

| ID | Requirement | Status | Implementation | Verification |
|---|---|---|---|---|
| PAT-SEC-001 | Patient records (name, contact, address, prescriptions) are personal health data. They leave the phone only through the authenticated API, and only the rep's own log is fetched (`mieId`). | Implemented | `api/patients.ts`, `config/axios.ts` | PAT-TC-001 |

## 10. Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| PAT-AC-001 | Given no signal, when a rep adds a patient with two prescription photos, then it appears at the top of the list at once. When signal returns, both photos and the record upload and the local photo copies are deleted. | PAT-FR-004, PAT-DATA-002 |

## 11. Testing Requirements

| ID | Scenario | Expected | Verifies |
|---|---|---|---|
| PAT-TC-001 | Open Patients with existing records; search by contact. | List, order and card fields as specified. | PAT-FR-001, PAT-SEC-001 |
| PAT-TC-002 | Save an empty form; then fill every field, picking a doctor. | All required-field messages; speciality auto-filled; phone formatted. | PAT-FR-002, PAT-BR-001, PAT-BR-002, PAT-BR-003, PAT-BR-004 |
| PAT-TC-003 | Add 5 photos, then try a 6th; open the viewer. | Picker limited to 5; viewer wraps around. | PAT-FR-003 |
| PAT-TC-004 | Add a patient offline, edit it, go online. | One record uploaded with the latest values and server photo paths. | PAT-FR-004, PAT-DATA-001, PAT-DATA-002 |
| PAT-TC-005 | Backend returns 4xx five times for one row, 500 for another. | First removed after 5 attempts; second retried. | PAT-API-001 |

## 12. Dependencies

- Backend `/patients`, `/patients/batch`, `/patients/attachments`; `expo-image-picker`, `expo-sqlite`, `expo-file-system`.

## 13. Known Gaps and Open Questions

| ID | Observation | Status |
|---|---|---|
| PAT-GAP-001 | On web, a queue write that exceeds storage quota is swallowed, so the save "succeeds" but nothing is stored. Photos are stored uncompressed as data URLs. Web is described as development-only; confirm. | Open |
| PAT-GAP-002 | The patient queue has no owner column. On a shared phone, the previous rep's pending patients appear in the next rep's list and upload under their token. | Open |
| PAT-GAP-003 | A row removed after 5 rejections disappears silently, and its local photos are not deleted. | Open |
| PAT-GAP-004 | When a full batch of 50 fails entirely, the flush loop re-sends without the "made progress" guard the profile queue has. This can loop while the server keeps failing. | Open |
| PAT-GAP-005 | The doctor picker de-duplicates by name, so two doctors with the same name collapse into one `doctor_id`. | Open |
| PAT-GAP-006 | The `PatientLogInput` type comment says "everything but the name is optional", but the UI requires nearly every field. Confirm which fields are mandatory server-side. | Open |
