---
name: project-profile-autofill
description: Architecture notes for the enrollment profile auto-fill refactor
metadata:
  type: project
---

Enrollment forms now auto-fill personal fields from the user's Firestore profile.

**Why:** Users were re-entering name, phone, birth date etc. on every enrollment form — a poor UX that also caused duplicate/inconsistent data in Firestore.

**How to apply:** Any new enrollment form should import `useUserProfile` and use `reset()` or `setValue()` to pre-fill fields on first render.

## Key files changed / created

- `src/hooks/useUserProfile.js` — new hook; reads `profileDoc` from AuthContext (already live-streamed), normalizes field names, derives Arabic display values for level/year selects.
- `src/services/firestoreService.js` — added `updateUserProfile()` — call after successful enrollment to write any user-edited personal data back to the branch user doc.
- `src/components/TrainingRegistrationForm.js` — uses `reset()` with profile defaults; shows blue banner when fields are pre-filled; calls `updateUserProfile` on submit.
- `src/components/LanguageRegistrationForm.js` — same pattern as training form.
- `src/components/AnnualFeeForm.js` — uses `setValue()` for guardianPhone, studentPhone, school, stream, level (Arabic), year (Arabic); shows blue banner.

## Data flow

1. User creates account → data saved in `branches/{branchId}/users/{uid}`.
2. `AuthContext` live-streams the user doc into `profileDoc`.
3. `useUserProfile` derives normalized values from `profileDoc`.
4. Enrollment form calls `reset()` / `setValue()` once (tracked with `profileAppliedRef`) when profile arrives.
5. User can edit any field freely.
6. On submit, `updateUserProfile()` writes changed values back to the user doc — single source of truth.

## Field mapping (profile → form)

| Profile field | Training form | Language form | Annual fee form |
|---|---|---|---|
| `fullName` / `name` | `studentName` | `studentName` | — |
| `birthDate` | `birthDate` | `birthDate` | — |
| `birthPlace` | `birthPlace` | `birthPlace` | — |
| `guardianPhone` / `phoneNumber` | `studentPhone` | `guardianPhone` | `guardianPhone` |
| `studentPhone` | — | `studentPhone` | `studentPhone` |
| `school` | — | — | `school` |
| `stream` | — | — | `stream` |
| `schoolLevel` (→ Arabic) | — | — | `level` |
| `studyYear` (→ Arabic) | — | — | `year` |
