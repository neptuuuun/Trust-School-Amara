# Trust School Amara — Multi-Branch Firestore Setup

This document summarizes the final data model, migration instructions, and admin usage for the multi-branch Firestore structure.

## Final Firestore Structure

branches/{branchId}/
  users/{uid}
  languages/{languageId}
  trainings/{trainingId}
  support_courses/{courseId}
  training_requests/{requestId}
  signups/{signupId}
  students/{studentId}
  studentSubjects/{subjectId}
  payments/{paymentId}
  recent_activity/{activityId}

notifications/{notificationId}  (global)

Branch document fields (editable later via admin):
{
  name: string,
  address: string,
  contactEmail: string,
  phone: string,
  mapUrl: string,
  description: string,
  createdAt: serverTimestamp()
}

## Branch Creation Steps

1) Create a document under `branches/{branchId}`.
2) Fill metadata fields (name, address, contactEmail, phone, mapUrl, description). The migration script seeds defaults if missing.
3) The Admin dashboard branch selector reads from the top-level `branches` collection.

## Migration Instructions

Script: `scripts/migrate-to-branches.js`

What it does (additive only):
- users_{branch} → branches/{branch}/users
- languages (global) → branches/{each}/languages
- trainings (global, by branchId) → branches/{branchId}/trainings
- supportCourses/support_lessons (global, by branchId) → branches/{branchId}/support_courses
- trainingRequests/trainer_requests (global, by branchId) → branches/{branchId}/training_requests
- signups (global, by branchId) → branches/{branchId}/signups
- studentSubjects (global, by branchId) → branches/{branchId}/studentSubjects
- payments (global, by branchId) → branches/{branchId}/payments

Requirements:
- Node.js
- Service account JSON with Firestore permissions

Steps (Windows PowerShell):
```
npm install firebase-admin
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
node scripts\migrate-to-branches.js
```

The script is safe and does not delete old data. Verify the migrated data before cleanup.

## Cloud Functions

File: `functions/index.js`
- onPaymentCreated → `branches/{branchId}/payments/{paymentId}`
- onPaymentUpdated → `branches/{branchId}/payments/{paymentId}`
- Notifications are sent only to admins within the same branch (`branches/{branchId}/users` where `role == 'admin'`).
- Daily expiry check iterates `branches/*/studentSubjects`.

Deploy:
```
npm --prefix functions install
firebase deploy --only functions
```

## Admin Usage & Data Visibility

- Admin selects a branch in the dashboard.
- All reads/writes occur under `branches/{selectedBranchId}/{subcollection}`.
- Examples:
  - Trainings: `branches/{branch}/trainings`
  - Languages: `branches/{branch}/languages`
  - Support courses: `branches/{branch}/support_courses`
  - Signups: `branches/{branch}/signups`
  - Payments: `branches/{branch}/payments`

## Student Flow

- Registration creates:
  - Profile at `branches/{branch}/users/{uid}`
  - Signup at `branches/{branch}/signups/{signupId}`
- Admin must approve signups before the student gains access.

## Cleanup (After Verification)

After you confirm data is present in `branches/{branch}/*`, remove old top-level collections:
- users_bordj_menaiel, users_boumerdes
- languages, trainings
- support_lessons, supportCourses
- trainingRequests, trainer_requests
- signups, payments, studentSubjects

Optionally use the prepared script: `scripts/cleanup-legacy.js` (edit the `COLLECTIONS` list before running).

Run (Windows PowerShell):
```
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
node scripts\cleanup-legacy.js
```

Backup is recommended prior to deletion.
