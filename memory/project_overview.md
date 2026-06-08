---
name: project-overview
description: High-level overview of the school management SPA
metadata:
  type: project
---

React SPA for a school management system (Algerian school) with branches.

**Why:** Full school enrollment platform — students register, admins verify, payments tracked.

**How to apply:** All features are branch-scoped. Always pass `selectedBranchId` from `useBranch()`. Auth state is in `AuthContext` which live-streams the user's Firestore doc as `profileDoc`.

## Tech stack
- React (CRA), React Router, react-hook-form, Tailwind CSS
- Firebase Auth + Firestore (branch-scoped collections)
- Supabase Storage (file uploads for receipts)
- lucide-react icons

## Firestore structure
```
branches/{branchId}/
  users/{uid}            ← single source of truth for student profile
  supportLessons/{id}
  languages/{id}
  trainings/{id}
  languagesForms/{uid}/languageFormEntries/{formId}
  trainingsForms/{uid}/trainingFormEntries/{formId}
  annualPayments/{id}
  registrations/{id}     ← support lesson registration summaries
  languagesRegistered/{id}
  trainingsRegistered/{id}
admins/{uid}
annualFees/{uid}
supportLessonRegistrations/{id}   ← global collection
```

## Branch IDs
- `boumerdes`
- `bordj_menaiel`

## Key contexts / hooks
- `useAuth()` — user, role, profileDoc (live-streamed), login/signup/logout
- `useBranch()` — selectedBranchId, setBranchFromAuth, resetBranch
- `useUserProfile()` — normalized profile data derived from profileDoc (see [[project-profile-autofill]])

## Admin dashboard
- Separate admin login at `/admin`
- Admin docs stored in `admins/{uid}` collection
- `src/admin/` contains all admin pages and components
