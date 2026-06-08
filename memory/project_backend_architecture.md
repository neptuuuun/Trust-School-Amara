---
name: project-backend-architecture
description: Which operations MUST go through the Express backend (Admin SDK) vs client-side Firestore; critical post-audit architectural decisions
metadata:
  type: project
---

The `supportLessonRegistrations` global collection is **backend-write-only** — the Firestore rule
explicitly sets `allow create, update, delete: if false` for all clients including admins.
Any browser code that writes to this collection will throw permission-denied.

## Operations that MUST use the backend API (Admin SDK)

| Operation | Endpoint |
|---|---|
| Student registers for monthly support lesson | `POST /api/registrations/support` |
| Admin verifies monthly support lesson payment | `PATCH /api/support-lesson-registrations/:id/verify` |
| Admin rejects monthly support lesson payment | `PATCH /api/support-lesson-registrations/:id/reject` |
| Admin renews support lesson registration | `PATCH /api/support-lesson-registrations/:id/renew` |
| Admin deletes support lesson registration | `DELETE /api/support-lesson-registrations/:id` |
| Admin verifies annual payment | `POST /api/admin/verify-annual-payment` |
| Admin rejects annual payment | `POST /api/admin/reject-annual-payment` |

## Root-level collections with no Firestore rule (deny-all)

- `annualFees/{userId}` — legacy collection. All reads/writes blocked. Do NOT write to it.
  The canonical annual fee data lives in `branches/{branchId}/annualPayments`.
- `getAnnualFeeStatus()` in firestoreService.js reads this (dead code, wrapped in try/catch).

## Auth account rollback on signup

If `setDoc` fails after `createUserWithEmailAndPassword`, `AuthContext.signup` now deletes
the Firebase Auth user via `cred.user.delete()` so the email address is reusable.

**Why:** Added 2026-05-31 after pre-launch audit found orphaned auth accounts.
**How to apply:** Do not remove this rollback. The delete call is inside a try/catch so it
won't mask the original error.
