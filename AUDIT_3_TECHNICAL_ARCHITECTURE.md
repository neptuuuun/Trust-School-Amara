# AUDIT DOCUMENT 3 — TECHNICAL ARCHITECTURE GUIDE

---

## Overall Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  (Create React App, Tailwind CSS, React Router 6)    │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │  Student   │  │   Admin    │  │  Public Pages  │ │
│  │   Pages    │  │  Dashboard │  │  (Home, Langs, │ │
│  │            │  │            │  │   Trainings)   │ │
│  └─────┬──────┘  └──────┬─────┘  └───────┬────────┘ │
│        │                │                │           │
│  ┌─────▼────────────────▼────────────────▼─────────┐ │
│  │            Contexts / State                      │ │
│  │  AuthContext  |  BranchContext  |  I18nContext   │ │
│  └─────┬─────────────────┬─────────────────────────┘ │
│        │                 │                            │
│  ┌─────▼─────────────────▼─────────────────────────┐ │
│  │               Services Layer                     │ │
│  │  firestoreService | userService | adminService   │ │
│  │  announcementService | googleAuthService         │ │
│  │  userLifecycleService | emailService             │ │
│  └──────────┬──────────────────┬────────────────────┘ │
└─────────────┼──────────────────┼──────────────────────┘
              │                  │
              ▼                  ▼
   ┌──────────────────┐  ┌──────────────────────┐
   │  Firebase SDK    │  │  Express.js Backend  │
   │  (Firestore,     │  │  (Admin SDK, CORS,   │
   │   Auth, Storage) │  │   Rate Limiting)     │
   └──────────────────┘  └──────────┬───────────┘
              │                     │
              ▼                     ▼
   ┌──────────────────┐  ┌──────────────────────┐
   │  Firestore DB    │  │  Firebase Admin SDK  │
   │  Firebase Auth   │  │  (writes to protected│
   │  Firebase Storage│  │   collections)       │
   └──────────────────┘  └──────────────────────┘
              │
              ▼
   ┌──────────────────┐
   │ Supabase Storage │
   │ (photos, proofs) │
   └──────────────────┘
```

---

## Frontend Structure

### Entry Points
- `src/index.js` — React root render
- `src/App.js` — Router, context providers, route guards, all routes
- `src/App.css` — Global styles

### Context Providers (in order, outermost first)
1. **BranchProvider** (`src/contexts/BranchContext.js`)
   - Manages `selectedBranchId` — persisted to `localStorage`
   - Streams branch list from Firestore
   - Three write paths: `selectBranch()` (UI), `setBranchFromAuth()` (post-login), `resetBranch()` (logout)

2. **AuthProvider** (`src/contexts/AuthContext.js`)
   - Manages user session, role, verification status
   - Exposes: `user`, `role`, `branch`, `verified`, `verificationStatus`, `profileDoc`, `adminData`, `completedProfile`
   - Two real-time listeners: user profile + admin doc snapshot
   - Auth methods: `login`, `signup`, `loginWithGoogle`, `registerWithGoogle`, `logout`

### Route Architecture (`App.js`)

```
/                       → RootRedirect (→ /select-branch or /home)
/select-branch          → BranchSelector (public)
/branchA                → BranchAlias (sets boumerdes, →/home)
/branchB                → BranchAlias (sets bordj_menaiel, →/home)

<BranchGuard>           ← requires selectedBranchId
  /login                → LoginPage (public)
  /register             → RegisterPage (public)
  /complete-registration → CompleteRegistrationPage (auth required)
  /internal-rules       → InternalRulesPage (public)
  /admin/login          → AdminLogin (public)

  <RequireAdmin>        ← requires role==='admin'
    /admin/*            → AdminDashboard (all admin sub-routes)

  <RequireStudent>      ← requires role==='student', email verified, verificationStatus!=='pending'
    /profile            → StudentDashboard
    /course-registration → CourseRegistrationPage
    /payment            → PaymentPage
    /registration-confirmation → RegistrationConfirmationPage
    /language-registration → LanguageRegistrationForm
    /support-lesson-registration → SupportLessonRegistrationForm
    /training-registration → TrainingRegistrationForm

  <PublicLayout>        ← public pages with header+footer
    /home               → HomePage
    /contact            → ContactPage
    /languages          → LanguagesPage
    /support-lessons    → SupportLessonsPage
    /support-lessons/:level/:year → YearPage
    /trainings          → TrainingsPage

* → ErrorPage (404)
```

### Route Guards
- **BranchGuard** — redirects to `/select-branch` if no branch selected
- **RequireAdmin** — redirects to `/admin/login` if not admin; enforces branch match
- **RequireStudent** — checks: logged in → profile complete → email verified → not pending

---

## Backend Structure

**Location:** `backend/server.js`  
**Port:** 3001 (configurable via `PORT` env var)

### Middleware Stack
```
trustProxy → helmet → cors → rateLimit → json parser
       ↓
  verifyToken (checks Firebase ID token on every request)
       ↓
  requireAdmin (validates admin status + branch binding)
       ↓
  Route handlers
```

### API Routes

```
GET  /health                                → health check

POST /api/admin/create-student             → creates Firebase Auth + Firestore profile
POST /api/admin/verify-annual-payment      → batch: verify payment + create support reg + update user
POST /api/admin/reject-annual-payment      → reject payment + cleanup
POST /api/admin/verify-user                → approve/reject student verification

POST /api/registrations/create             → create support lesson registration (Admin SDK)
POST /api/registrations/verify             → verify support registration
POST /api/registrations/reject             → reject support registration

POST /api/support-lesson-registrations/... → monthly subscription management

POST /api/corrections/request             → admin requests payment re-upload
POST /api/corrections/resubmit            → student submits corrected proof

POST /api/notify                           → create notification document
```

---

## Firebase Structure

### Collections

```
/admins/{uid}                              ← global, Admin SDK only
/users/{userId}                            ← legacy root (kept for backward compat)
/supportLessonRegistrations/{id}           ← global monthly subscriptions
/notifications/{id}                        ← global notifications

/branches/{branchId}/                      ← ALL student data lives here
  users/{uid}                              ← student profiles
  languages/{id}                           ← language catalog
  trainings/{id}                           ← training catalog
  supportLessons/{id}                      ← support lesson catalog (legacy)
  subjects/{id}                            ← academic subjects
  classes/{id}                             ← academic classes
  teachers/{id}                            ← teacher catalog
  signups/{id}                             ← legacy language signups
  trainingRequests/{id}                    ← training interest forms
  payments/{id}                            ← payment records
  annualPayments/{id}                      ← annual fee payments (source of truth)
  annualFees/{id}                          ← annual fee archive
  announcements/{id}                       ← branch announcements
  meta/{document}                          ← branch metadata
  registrations/{id}                       ← support lesson summaries (branch view)
  languagesRegistered/{id}                 ← approved language registrations
  trainingsRegistered/{id}                 ← approved training registrations
  languagesForms/{userId}/
    languageFormEntries/{entryId}          ← student language registration forms
  trainingsForms/{userId}/
    trainingFormEntries/{entryId}          ← student training registration forms
```

---

## Services Layer

### `src/services/firestoreService.js` (3037 lines — monolith)

Covers all Firestore read/write operations:
- Subjects & Classes (academic model)
- Teachers catalog
- User management
- Language registration lifecycle
- Support lesson management
- Annual payments
- Support lesson registration lifecycle
- Payment correction workflow
- Training registrations
- Registered languages/trainings streaming

### `src/services/userService.js`
- Supabase file uploads (photos, ID card, payment proofs)
- WebP optimization via `imageOptimizer.js`
- User registration with file handling
- Verification request submission

### `src/services/adminService.js`
- Admin doc fetching (`/admins/{uid}`)
- Admin real-time snapshot listener
- Branch access validation

### `src/services/announcementService.js`
- Branch-scoped announcement streaming
- Admin announcement management (CRUD)
- Category and style filtering

### `src/services/googleAuthService.js`
- Cross-branch user lookup for Google sign-in
- Google stub user creation for new registrations
- Profile completion after Google sign-up

### `src/services/userLifecycleService.js`
- Automatic status transitions on inactivity
- Activity recording on login
- Status calculation from `lastActivityAt`

### `src/services/emailService.js`
- EmailJS client-side email sending
- **⚠️ NOT CONFIGURED** — no credentials or templates set up

---

## Data Flows

### 1. Self-Registration (Email/Password)

```
Student visits /register
    ↓
Selects branch (BranchSelector required)
    ↓
Fills registration form + accepts internal rules
    ↓
AuthContext.signup() →
  1. Firebase Auth: createUserWithEmailAndPassword()
  2. Firestore: setDoc branches/{branchId}/users/{uid} with status='email_pending'
  3. Firebase Auth: sendEmailVerification()
  ↗ ROLLBACK: if Firestore fails → cred.user.delete()
    ↓
Student receives verification email
    ↓
Student clicks link → emailVerified=true in Firebase Auth
    ↓
syncEmailVerificationIfNeeded():
  - Updates Firestore: status='active', verificationStatus='pending'
    ↓
Admin reviews → approves → verificationStatus='verified'
    ↓
Student can access all student routes
```

### 2. Google Registration (New User)

```
Student visits /register → clicks "Sign in with Google"
    ↓
registerWithGoogle() → signInWithPopup()
    ↓
No existing Firestore doc found →
  googleAuthService.createGoogleUserStub():
    - Creates branches/{branchId}/users/{uid} with completedProfile=false
    ↓
Redirect to /complete-registration
    ↓
Student fills mandatory fields + uploads photos
    ↓
googleAuthService.completeGoogleProfile():
  - Uploads photos to Supabase
  - Updates Firestore: completedProfile=true, verificationStatus='pending'
    ↓
Admin reviews → approves
```

### 3. Annual Fee Payment

```
Student clicks "Pay Annual Fee"
    ↓
Navigates to /support-lessons
    ↓
Selects lesson → SupportLessonRegistrationForm
    ↓
Uploads payment proof to Supabase
    ↓
Creates annualPayments/{id} in Firestore with status='pending'
    ↓
Admin sees payment in PaymentsVerification page
    ↓
Admin clicks "Verify":
  POST /api/admin/verify-annual-payment → Admin SDK batch write:
    1. annualPayments/{id}.status = 'verified'
    2. Creates supportLessonRegistrations/{id} (global collection)
    3. Creates branches/{branchId}/registrations/{id} (branch view)
    4. Updates user: yearlyFeePaid=true
    5. Archives to annualFees/{id}
    ↓
Student dashboard shows: Rسوم السنوية مدفوعة ✓
Student can now access support lesson registration
```

### 4. Language Registration

```
Student visits /language-registration
    ↓
LanguageRegistrationForm:
  - Selects language + level
  - Uploads payment proof to Supabase
  - Creates languagesForms/{userId}/languageFormEntries/{id} with status='pending'
    ↓
Admin sees in LanguageRegisteredPage
    ↓
Admin clicks "Approve":
  firestoreService.verifyLanguageRegistration():
    1. assertClassNotFull(classId) — checks capacity
    2. adjustClassEnrollment(classId, +1) — increments count
    3. Updates entry: status='verified'
    4. Creates languagesRegistered/{id}
    5. Updates user.registrations.languages[]
    6. Deletes receipt from Supabase storage
    ↓
OR Admin clicks "Reject":
  firestoreService.rejectLanguageRegistration():
    1. Updates entry: status='rejected'
    2. Deletes receipt from Supabase storage
```

### 5. Payment Correction

```
Admin sees issue with payment proof
    ↓
Admin clicks "Request Correction":
  POST /api/corrections/request → Admin SDK:
    - Updates payment: status='needs_correction', correctionReason='...'
    ↓
Student dashboard shows PaymentCorrectionBanner
    ↓
Student uploads new proof:
  POST /api/corrections/resubmit → Admin SDK:
    - Archives old proof reference
    - Uploads new proof to Supabase
    - Updates payment: status='pending', correctionCount++
    ↓
Admin reviews again
```

### 6. Admin Direct Student Enrollment

```
Admin clicks "Create Student"
    ↓
AdminCreateStudentModal fills: name, email, password, branch info, studyYear
    ↓
POST /api/admin/create-student → Admin SDK:
    1. Firebase Auth: createUser() with email + temporary password
    2. Firestore: setDoc branches/{branchId}/users/{uid}:
       - role: 'student'
       - verificationStatus: 'verified' (pre-approved)
       - status: 'active'
       - registrationNumber: auto-generated
    ↓
Student can log in immediately (no pending review)
```

---

## Utilities

| Utility | Purpose |
|---|---|
| `utils/firestorePaths.js` | Centralized branch-scoped path helpers |
| `utils/registrationUtils.js` | `getComputedStatus()`, `getExpiryLabel()`, `STATUS_UI` map |
| `utils/dateUtils.js` | `formatDate()`, `formatMonthYear()` helpers |
| `utils/csvExport.js` | Export student/payment data to CSV |
| `utils/imageOptimizer.js` | Convert images to WebP before Supabase upload |
| `utils/classValidation.js` | Class capacity validation helpers |
| `utils/migrationScript.js` | Data migration utility (run manually) |
| `utils/printRecord.js` | Print a student record to PDF |
| `utils/apiClient.js` | Axios wrapper for backend API calls with auth token |

---

## Configuration Files

| File | Purpose |
|---|---|
| `src/firebase.js` | Firebase SDK initialization + exports |
| `src/supabase.js` | Supabase client initialization |
| `src/config/paymentConfig.js` | Payment amounts and configuration |
| `src/data/studyLevels.js` | Academic levels/years reference data |
| `src/i18n/I18nContext.js` | Internationalization context (Arabic primary) |
| `tailwind.config.js` | Tailwind theme: primary/secondary brand colors |
| `postcss.config.js` | PostCSS configuration for Tailwind |
| `firebase.json` | Firebase deployment targets |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Composite index definitions |
| `storage.rules` | Firebase Storage security rules |
| `.firebaserc` | Firebase project binding (`trust-school`) |
