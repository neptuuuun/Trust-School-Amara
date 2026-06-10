# AUDIT DOCUMENT 4 — DATABASE DOCUMENTATION

**Database:** Google Cloud Firestore (NoSQL document database)  
**Project:** `trust-school`

---

## Root Collections

---

### `/admins/{uid}`

**Purpose:** Global admin account registry. Controls who has admin access to which branch.

**Security:** Write is `allow write: if false` — only writable via Firebase Console or Admin SDK backend script.

| Field | Type | Required | Description |
|---|---|---|---|
| `uid` | string | ✅ | Firebase Auth UID (matches document ID) |
| `email` | string | ✅ | Admin email address |
| `branchId` | string | ✅ | Branch this admin manages (`boumerdes` or `bordj_menaiel`) |
| `role` | string | ✅ | Always `'admin'` |
| `name` | string | ✗ | Admin display name |
| `createdAt` | Timestamp | ✗ | Creation timestamp |

**Example Document:**
```json
{
  "uid": "abc123xyz",
  "email": "admin@trust-school.dz",
  "branchId": "boumerdes",
  "role": "admin",
  "name": "مدير الفرع"
}
```

**Security Considerations:** Admin provisioning must only be done via Admin SDK or Firebase Console. The Firestore rule blocks all client writes unconditionally.

---

### `/supportLessonRegistrations/{registrationId}`

**Purpose:** Global collection of monthly support lesson subscriptions. Written **only** by the Express backend (Admin SDK). Students and admins can read their own.

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | string | ✅ | Student's Firebase UID |
| `branchId` | string | ✅ | Branch ID for isolation |
| `lessonId` | string | ✅ | Class/lesson ID (unified catalog) |
| `subjectName` | string | ✗ | Human-readable lesson name |
| `status` | string | ✅ | `pending` / `verified` / `active` / `expired` / `rejected` / `needs_correction` |
| `source` | string | ✗ | `'annualFee'` if bundled with annual fee, `'monthly'` otherwise |
| `includesAnnualFee` | boolean | ✗ | Whether annual fee was included |
| `startDate` | Timestamp | ✗ | Subscription start date |
| `endDate` | Timestamp | ✗ | Subscription end date |
| `durationInMonths` | number | ✗ | Subscription duration |
| `studyYearId` | string | ✗ | Academic year ID |
| `studyYearLabel` | string | ✗ | Academic year display label |
| `studyLevelId` | string | ✗ | Level ID (middle/high) |
| `createdAt` | Timestamp | ✅ | Creation timestamp |
| `verifiedAt` | Timestamp | ✗ | When verified by admin |
| `correctionReason` | string | ✗ | Reason for correction request |
| `correctionRequestedAt` | Timestamp | ✗ | When correction was requested |

**Indexes Required:**
- `(branchId ASC, createdAt DESC)`
- `(branchId ASC, status ASC)`
- `(userId ASC, lessonId ASC)`

---

### `/notifications/{notificationId}`

**Purpose:** Global in-app notification broadcast.

| Field | Type | Required | Description |
|---|---|---|---|
| `target` | string | ✅ | `'all'` for broadcast or specific UID |
| `title` | string | ✅ | Notification title |
| `message` | string | ✅ | Notification body |
| `createdAt` | Timestamp | ✅ | Creation time |

---

### `/users/{userId}` (Legacy)

**Purpose:** Legacy root-level user profiles. Kept for backward compatibility. Active student profiles are in `/branches/{branchId}/users/{uid}`.

Same schema as branch-scoped `users` collection below.

---

## Branch-Scoped Collections

All collections below exist under `/branches/{branchId}/...`

Known `branchId` values: `boumerdes`, `bordj_menaiel`

---

### `/branches/{branchId}` (Branch Document)

| Field | Type | Description |
|---|---|---|
| `name` | string | Branch display name (Arabic) |
| `nameEn` | string | Branch name (English) |
| `priceOverrides` | map | Per-branch pricing: `{ yearlyFee, supportLessons: { monthly } }` |
| `adminEmails` | array | Fallback admin email list (used if `/admins/{uid}` lookup fails) |

---

### `/branches/{branchId}/users/{uid}`

**Purpose:** Student profile (canonical user document). The primary source of truth for student state.

| Field | Type | Required | Description |
|---|---|---|---|
| `uid` | string | ✅ | Firebase Auth UID |
| `email` | string | ✅ | Student email |
| `name` | string | ✅ | Full name |
| `fullName` | string | ✗ | Alias for `name` |
| `role` | string | ✅ | Always `'student'` |
| `branchId` | string | ✅ | Branch ID |
| `branchName` | string | ✗ | Branch display name |
| `status` | string | ✅ | `email_pending` / `active` / `inactive` / `archived` |
| `verificationStatus` | string | ✅ | `unverified` / `pending` / `verified` / `rejected` |
| `emailVerified` | boolean | ✗ | Firestore copy of Firebase Auth emailVerified |
| `verified` | boolean | ✗ | Legacy — use `verificationStatus` |
| `accountVerified` | boolean | ✗ | Legacy — use `verificationStatus` |
| `paymentVerified` | boolean | ✗ | Legacy payment flag |
| `yearlyFeePaid` | boolean | ✗ | Annual fee paid flag |
| `completedProfile` | boolean | ✗ | `false` for Google stub until complete-registration |
| `birthDate` | string | ✗ | Date of birth (ISO string) |
| `birthPlace` | string | ✗ | Place of birth |
| `address` | string | ✗ | Home address |
| `phoneNumber` | string | ✗ | Guardian phone |
| `phone` | string | ✗ | Alias for phoneNumber |
| `guardianPhone` | string | ✗ | Guardian phone (preferred field) |
| `studentPhone` | string | ✗ | Student's own phone |
| `school` | string | ✗ | School/institution name |
| `stream` | string | ✗ | Academic stream/track |
| `studyYear` | string | ✗ | Academic year ID |
| `schoolLevel` | string | ✗ | `middle` or `high` |
| `registrationNumber` | string | ✗ | Auto-generated for admin-enrolled students |
| `internalRulesAccepted` | boolean | ✗ | Whether internal rules were accepted |
| `profilePictureUrl` | string | ✗ | Supabase URL for profile photo |
| `idCardUrl` | string | ✗ | Supabase URL for ID card photo |
| `registrations` | map | ✗ | Snapshot of registrations: `{ languages[], trainings[], annualFeeHistory[], annualFee }` |
| `lastActivityAt` | Timestamp | ✗ | For lifecycle management |
| `lifecycleStatus` | string | ✗ | Lifecycle state (active/inactive/archived) |
| `createdAt` | Timestamp | ✅ | Account creation time |
| `updatedAt` | Timestamp | ✅ | Last update time |

**Security Considerations:**
- `isSafeUserCreate()` prevents self-assigning verified/admin/paid flags
- `isSafeUserSelfUpdate()` prevents self-changing role, studyYear, or any verification flag
- `isCompletingRegistration()` allows one-way `completedProfile: false → true` transition only

---

### `/branches/{branchId}/languages/{languageId}`

**Purpose:** Language course catalog (what languages are offered).

| Field | Type | Description |
|---|---|---|
| `name` | string | Language name (Arabic) |
| `nameEn` | string | Language name (English) |
| `levels` | array | Available levels `[{ id, label, capacity }]` |
| `price` | number | Course price in DZD |
| `description` | string | Course description |
| `status` | string | `active` / `inactive` |
| `createdAt` | Timestamp | Creation time |

---

### `/branches/{branchId}/trainings/{trainingId}`

**Purpose:** Training course catalog.

| Field | Type | Description |
|---|---|---|
| `title` | string | Training title |
| `description` | string | Training description |
| `price` | number | Price in DZD |
| `duration` | string | Duration label |
| `status` | string | `active` / `inactive` |
| `capacity` | number | Maximum participants |
| `enrollmentCount` | number | Current enrollments |
| `createdAt` | Timestamp | Creation time |

---

### `/branches/{branchId}/supportLessons/{lessonId}` (Legacy)

**Purpose:** Legacy support lesson catalog. The new model uses `subjects` and `classes`. Both collections are queried with fallback for backward compatibility.

| Field | Type | Description |
|---|---|---|
| `name` | string | Lesson name |
| `subject` | string | Subject name |
| `studyYear` | string | Academic year ID |
| `studyLevel` | string | Level label |
| `level` | string | `middle` / `high` |
| `price` | number | Monthly price |
| `capacity` | number | Max students |
| `enrollmentCount` | number | Current enrollment |
| `status` | string | `active` / `inactive` |

---

### `/branches/{branchId}/subjects/{subjectId}`

**Purpose:** Academic subject definitions (new catalog model).

| Field | Type | Description |
|---|---|---|
| `name` | string | Subject name (Arabic) |
| `serviceType` | string | `supportLesson` / `language` / `training` |
| `studyYear` | string | Target academic year |
| `status` | string | `active` / `inactive` |
| `createdAt` | Timestamp | Creation time |

---

### `/branches/{branchId}/classes/{classId}`

**Purpose:** Specific class sessions within a subject. The `classId` is used as `lessonId` in support registrations.

| Field | Type | Description |
|---|---|---|
| `subjectId` | string | Parent subject ID |
| `name` | string | Class name/label |
| `serviceType` | string | `supportLesson` / `language` |
| `studyYear` | string | Academic year |
| `teacherId` | string | Assigned teacher ID |
| `schedule` | string | Schedule description |
| `capacity` | number | Maximum students |
| `enrollmentCount` | number | Current enrollment (updated by Admin SDK) |
| `status` | string | `active` / `inactive` |
| `price` | number | Monthly price |

**Indexes Required:**
- `(serviceType ASC, subjectId ASC)`
- `(serviceType ASC, studyYear ASC, status ASC)`

---

### `/branches/{branchId}/teachers/{teacherId}`

**Purpose:** Teacher names catalog displayed to students.

| Field | Type | Description |
|---|---|---|
| `name` | string | Teacher full name |
| `subject` | string | Subject specialization |
| `status` | string | `active` / `inactive` |

---

### `/branches/{branchId}/annualPayments/{paymentId}`

**Purpose:** Annual fee payment records. **Single source of truth** for annual fee status.

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | string | ✅ | Student UID |
| `branchId` | string | ✅ | Branch ID |
| `status` | string | ✅ | `pending` / `verified` / `rejected` / `needs_correction` |
| `amount` | number | ✗ | Amount paid (DZD) |
| `receiptUrl` | string | ✗ | Supabase URL for payment proof |
| `correctionReason` | string | ✗ | Admin's reason for requesting correction |
| `correctionRequestedAt` | Timestamp | ✗ | When correction was requested |
| `correctionCount` | number | ✗ | How many times corrected |
| `verifiedAt` | Timestamp | ✗ | When admin verified |
| `verifiedBy` | string | ✗ | Admin UID who verified |
| `createdAt` | Timestamp | ✅ | Submission time |

**Security:**
- Students can create with `status='pending'` only
- Updates require branch admin or Admin SDK

**Indexes Required:**
- `(userId ASC, createdAt DESC)`
- `(userId ASC, status ASC)`

---

### `/branches/{branchId}/languagesForms/{userId}/languageFormEntries/{entryId}`

**Purpose:** Student-submitted language registration forms (before admin approval).

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `branchId` | string | Branch ID (for collection-group queries) |
| `languageId` | string | Language catalog ID |
| `languageName` | string | Human-readable language name |
| `levelId` | string | Level ID |
| `levelLabel` | string | Level display label |
| `classId` | string | Selected class ID |
| `status` | string | `pending` / `verified` / `rejected` / `needs_correction` |
| `receiptUrl` | string | Supabase URL for payment proof |
| `receiptPath` | string | Supabase storage path |
| `correctionReason` | string | Admin's correction reason |
| `correctionRequestedAt` | Timestamp | When correction requested |
| `submittedAt` | Timestamp | Form submission time |

**Indexes Required (collection-group):**
- `(branchId ASC, submittedAt DESC)`
- `(branchId ASC, verified ASC, submittedAt DESC)`
- `(branchId ASC, status ASC)`

---

### `/branches/{branchId}/languagesRegistered/{documentId}`

**Purpose:** Approved language registrations archive. Written only by admin during approval.

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `branchId` | string | Branch ID |
| `languageName` | string | Language name |
| `levelLabel` | string | Level label |
| `classId` | string | Class ID |
| `registeredAt` | Timestamp | Approval timestamp |
| `verifiedBy` | string | Admin UID |

---

### `/branches/{branchId}/trainingsForms/{userId}/trainingFormEntries/{entryId}`

**Purpose:** Student-submitted training registration forms.

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `branchId` | string | Branch ID |
| `trainingId` | string | Training catalog ID |
| `trainingTitle` | string | Training name |
| `trainingPrice` | number | Price at time of registration |
| `status` | string | `pending` / `verified` / `rejected` / `needs_correction` |
| `receiptUrl` | string | Supabase URL for payment proof |
| `correctionReason` | string | Admin's correction reason |
| `submittedAt` | Timestamp | Submission time |

**Indexes Required (collection-group):**
- `(branchId ASC, status ASC, verified ASC)`

---

### `/branches/{branchId}/trainingsRegistered/{documentId}`

**Purpose:** Approved training registrations archive.

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `trainingTitle` | string | Training name |
| `trainingPrice` | number | Price |
| `registeredAt` | Timestamp | Approval timestamp |

---

### `/branches/{branchId}/payments/{paymentId}`

**Purpose:** General payment records (admin-written only per Firestore rules).

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `branchId` | string | Branch ID |
| `type` | string | Payment type |
| `amount` | number | Amount (DZD) |
| `status` | string | `pending` / `approved` / `rejected` |
| `receiptUrl` | string | Payment proof URL |
| `createdAt` | Timestamp | Submission time |

**Indexes Required:**
- `(userId ASC, branchId ASC, createdAt DESC)`

---

### `/branches/{branchId}/registrations/{registrationId}`

**Purpose:** Branch-scoped view of support lesson registrations (summary of the global collection).

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `lessonId` | string | Class/lesson ID |
| `status` | string | Registration status |
| `startDate` | Timestamp | Subscription start |
| `endDate` | Timestamp | Subscription end |
| `createdAt` | Timestamp | Creation time |

---

### `/branches/{branchId}/announcements/{announcementId}`

**Purpose:** Branch-specific announcements shown to students.

| Field | Type | Description |
|---|---|---|
| `title` | string | Announcement title |
| `content` | string | Announcement body |
| `category` | string | `languages` / `trainings` / `support` / `events` / `general` |
| `style` | string | `info` / `warning` / `success` / `urgent` |
| `status` | string | `published` / `draft` |
| `targetPage` | string | Which page to display on |
| `expiresAt` | Timestamp | When to stop showing |
| `createdAt` | Timestamp | Creation time |
| `createdBy` | string | Admin UID |

---

### `/branches/{branchId}/trainingRequests/{documentId}`

**Purpose:** Student expressions of interest in a training (not a full registration).

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `trainingId` | string | Training ID |
| `trainingName` | string | Training name |
| `status` | string | `pending` / `reviewed` |
| `submittedAt` | Timestamp | Submission time |

---

### `/branches/{branchId}/annualFees/{documentId}`

**Purpose:** Annual fee archive (written by Admin SDK during payment verification).

| Field | Type | Description |
|---|---|---|
| `userId` | string | Student UID |
| `year` | number | Academic year (e.g., 2026) |
| `registeredAt` | Timestamp | Verification timestamp |
| `paymentId` | string | Linked annual payment ID |
