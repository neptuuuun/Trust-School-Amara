# AUDIT DOCUMENT 2 — COMPLETE FEATURE INVENTORY

**Based on actual code inspection. Every feature below is verified from implementation.**

---

## STUDENT FEATURES

### Registration

| Feature | Verified From | Status |
|---|---|---|
| Email/password self-registration | `AuthContext.js:signup()`, `RegisterPage.js` | ✅ Implemented |
| Google OAuth registration (new user) | `AuthContext.js:registerWithGoogle()`, `googleAuthService.js:createGoogleUserStub()` | ✅ Implemented |
| Google OAuth sign-in (existing user) | `AuthContext.js:loginWithGoogle()` | ✅ Implemented |
| Post-Google profile completion form | `CompleteRegistrationPage.js`, `googleAuthService.js:completeGoogleProfile()` | ✅ Implemented |
| Email verification gate | `App.js:RequireStudent()`, `AuthContext.js:syncEmailVerificationIfNeeded()` | ✅ Implemented |
| Branch selection before registration | `BranchSelector.js`, `App.js:BranchGuard()` | ✅ Implemented |
| Rollback on Firestore failure | `AuthContext.js:signup()` — deletes Firebase Auth user if Firestore write fails | ✅ Implemented |
| Internal rules acceptance | `InternalRulesPage.js`, `payload.internalRulesAccepted` in signup | ✅ Implemented |

### Login

| Feature | Verified From | Status |
|---|---|---|
| Email/password login | `AuthContext.js:login()`, `LoginPage.js` | ✅ Implemented |
| Google sign-in (existing users only) | `AuthContext.js:loginWithGoogle()` | ✅ Implemented |
| Admin login (separate page) | `AdminLogin.js`, `admin/login` route | ✅ Implemented |
| Cross-branch user lookup for Google | `googleAuthService.js:findUserAcrossBranches()` | ✅ Implemented |
| Branch mismatch rejection on login | `App.js:BranchGuard()`, `AuthContext.js:login()` | ✅ Implemented |

### Student Profile (Dashboard)

| Feature | Verified From | Status |
|---|---|---|
| View profile (name, email, phone, birth date, address, school) | `StudentDashboard.js` — profile section | ✅ Implemented |
| Edit profile (limited fields) | `StudentDashboard.js:handleSaveProfile()`, `firestoreService.js:updateUserProfile()` | ✅ Implemented |
| Email and branch are read-only | `StudentDashboard.js` — Lock icon on those fields | ✅ Implemented |
| Upload profile photo and ID card | `CompleteRegistrationPage.js`, `userService.js:uploadToSupabase()` | ✅ Implemented |
| View ID card link | `StudentDashboard.js:idCardUrl` | ✅ Implemented |
| Re-submit verification documents | `StudentDashboard.js:handleResubmitVerification()` | ✅ Implemented |
| View verification status (pending/verified/rejected) | `StudentDashboard.js` — header badges | ✅ Implemented |

### Payments

| Feature | Verified From | Status |
|---|---|---|
| Upload annual fee payment proof | `PaymentUploadForm.js`, `StudentDashboard.js:handlePaymentUpload()` | ✅ Implemented |
| View annual fee status | `StudentDashboard.js` — annual fee section | ✅ Implemented |
| Payment correction banner (re-upload) | `PaymentCorrectionBanner.js`, `correctionItems` computation | ✅ Implemented |
| View payment history | `payments` listener in `StudentDashboard.js` | ✅ Implemented |
| Upload payment proof for language course | `LanguageRegistrationForm.js` | ✅ Implemented |
| Upload payment proof for training course | `TrainingRegistrationForm.js` | ✅ Implemented |
| Upload payment proof for support lesson | `SupportLessonRegistrationForm.js` | ✅ Implemented |

### Annual Fees

| Feature | Verified From | Status |
|---|---|---|
| Pay annual fee (1000 DZD shown in dashboard) | `StudentDashboard.js:annualFeeSubtitle` | ✅ Implemented |
| View annual fee payment status | `StudentDashboard.js:annualFeeStatus` from `annualPayments` collection | ✅ Implemented |
| Annual fee history display | `StudentDashboard.js:sortedAnnualFeeHistory` | ✅ Implemented |
| Annual fee unlocks support lesson access | `firestoreService.js:verifyAnnualPayment()` creates `supportLessonRegistrations` | ✅ Implemented |
| needs_correction state for annual payment | `StudentDashboard.js:isAnnualFeeNeedsCorrection` | ✅ Implemented |

### Support Classes

| Feature | Verified From | Status |
|---|---|---|
| Browse support lessons catalog | `SupportLessonsPage.js` | ✅ Implemented |
| Browse by level and year | `YearPage.js`, route `support-lessons/:level/:year` | ✅ Implemented |
| Register for support lesson (monthly) | `SupportLessonRegistrationForm.js`, `firestoreService.js:createSupportLessonRegistration()` | ✅ Implemented |
| View support registrations with status | `StudentDashboard.js` — support lessons card | ✅ Implemented |
| View subscription expiry | `StudentDashboard.js:getExpiryLabel()`, `registrationUtils.js` | ✅ Implemented |
| Renew expired subscription link | `StudentDashboard.js` — "تجديد الاشتراك" link | ✅ Implemented |
| Annual-fee-gated access | Requires `annualFeeStatus.status === 'verified'` | ✅ Implemented |

### Training Courses

| Feature | Verified From | Status |
|---|---|---|
| Browse training catalog | `TrainingsPage.js` | ✅ Implemented |
| Register for a training course | `TrainingRegistrationForm.js` | ✅ Implemented |
| View pending/approved/rejected training registrations | `StudentDashboard.js` — trainings card | ✅ Implemented |
| Submit training request (interest) | `TrainingRequestForm.js` | ✅ Implemented |

### Languages

| Feature | Verified From | Status |
|---|---|---|
| Browse language catalog | `LanguagesPage.js` (student-facing) | ✅ Implemented |
| Register for a language course | `LanguageRegistrationForm.js` | ✅ Implemented |
| View pending/approved/rejected language registrations | `StudentDashboard.js` — languages card | ✅ Implemented |

### Announcements / Notifications

| Feature | Verified From | Status |
|---|---|---|
| View branch announcements | `PageAnnouncements.js` | ✅ Implemented |
| Personalized announcements on dashboard | `PersonalizedAnnouncements.js` | ✅ Implemented |
| In-app notifications | `notifications` listener in `StudentDashboard.js` | ✅ Implemented |
| Payment correction notification banner | `PaymentCorrectionBanner.js` | ✅ Implemented |

---

## ADMIN FEATURES

### Dashboard / Overview

| Feature | Verified From | Status |
|---|---|---|
| Overview statistics | `admin/pages/Overview.js` | ✅ Implemented |
| Admin guide page | `admin/pages/AdminGuide.js` | ✅ Implemented |
| Branch-scoped view (admin sees only their branch) | `adminService.js:validateBranchAccess()`, `requireAdmin` middleware | ✅ Implemented |

### Student Management

| Feature | Verified From | Status |
|---|---|---|
| List all students | `admin/pages/UsersPage.js` | ✅ Implemented |
| Search/filter students | `UsersPage.js` | ✅ Implemented |
| View student detail | `UsersPage.js` | ✅ Implemented |
| Create student (admin-direct enrollment) | `AdminCreateStudentModal.js`, `POST /api/admin/create-student` | ✅ Implemented |
| Edit student profile | `UsersPage.js` | ✅ Implemented |
| Delete student | `UsersPage.js` | ✅ Implemented |
| View student documents (photos, ID) | `FileViewerModal.js` | ✅ Implemented |
| Print student record | `utils/printRecord.js` | ✅ Implemented |
| CSV export of students | `utils/csvExport.js` | ✅ Implemented |

### Registration Approval

| Feature | Verified From | Status |
|---|---|---|
| Review pending student registrations | `UsersPage.js` — verification filter | ✅ Implemented |
| Approve student account | `firestoreService.js:updateUserVerification()` | ✅ Implemented |
| Reject student account | `firestoreService.js` | ✅ Implemented |

### Payment Verification

| Feature | Verified From | Status |
|---|---|---|
| View pending payments | `admin/pages/PaymentsVerification.js` | ✅ Implemented |
| Approve annual payment | `firestoreService.js:verifyAnnualPayment()` — batch write | ✅ Implemented |
| Reject annual payment | `POST /api/admin/reject-annual-payment` (backend) | ✅ Implemented |
| View payment proof image | `PaymentProofViewer.js` | ✅ Implemented |
| Request payment correction | `firestoreService.js:requestPaymentCorrection()` via backend | ✅ Implemented |

### Annual Fee Management

| Feature | Verified From | Status |
|---|---|---|
| Manage annual fees | `admin/pages/AnnualFees.js` | ✅ Implemented |
| Academic year awareness (Sep–Aug) | `firestoreService.js:getCurrentAcademicYear()` | ✅ Implemented |
| Verify yearly fee | `firestoreService.js:verifyYearlyFee()` | ✅ Implemented |

### Language Management

| Feature | Verified From | Status |
|---|---|---|
| Manage language catalog | `admin/pages/LanguagesPage.js`, `AddEditLanguageModal.js` | ✅ Implemented |
| Review language registration requests | `admin/pages/LanguageRegisteredPage.js` | ✅ Implemented |
| Approve language registration | `firestoreService.js:verifyLanguageRegistration()` — capacity check + archive | ✅ Implemented |
| Reject language registration | `firestoreService.js:rejectLanguageRegistration()` — cleanup | ✅ Implemented |

### Training Management

| Feature | Verified From | Status |
|---|---|---|
| Manage training catalog | `admin/pages/TrainingsPage.js`, `AddEditTrainingModal.js` | ✅ Implemented |
| Review training registration requests | `admin/pages/TrainingRegisteredPage.js` | ✅ Implemented |
| Review training interest requests | `admin/pages/TrainingRequestsPage.js` | ✅ Implemented |

### Support Classes Management

| Feature | Verified From | Status |
|---|---|---|
| Manage middle-school support lessons | `admin/pages/SupportLessonsMiddlePage.js` | ✅ Implemented |
| Manage high-school support lessons | `admin/pages/SupportLessonsHighPage.js` | ✅ Implemented |
| View support registrations | `admin/pages/SupportRegisteredPage.js` | ✅ Implemented |
| Add/remove students from support class | `AddSupportStudentModal.js` | ✅ Implemented |
| Edit support registration | `EditSupportRegistrationModal.js` | ✅ Implemented |

### Subject/Class Management (Academic Catalog)

| Feature | Verified From | Status |
|---|---|---|
| Manage subjects | `admin/components/SubjectClassManager.js`, `SubjectFormModal.js` | ✅ Implemented |
| Manage classes within subjects | `ClassFormModal.js` | ✅ Implemented |
| Set class capacity | `firestoreService.js:assertClassNotFull()` | ✅ Implemented |
| Track enrollment count | `firestoreService.js:adjustClassEnrollment()` | ✅ Implemented |

### Teachers Management

| Feature | Verified From | Status |
|---|---|---|
| Add/edit/delete teachers | `TeacherManagerModal.js`, `firestoreService.js` teacher methods | ✅ Implemented |

### Announcements

| Feature | Verified From | Status |
|---|---|---|
| Create/edit/delete announcements | `admin/pages/AnnouncementsPage.js`, `AnnouncementFormModal.js` | ✅ Implemented |
| Categories: languages, trainings, support, events, general | `announcementService.js` | ✅ Implemented |
| Styles: info, warning, success, urgent | `announcementService.js` | ✅ Implemented |
| Publish/draft/schedule | `announcementService.js:streamAdminAnnouncements()` | ✅ Implemented |

### Reports / Statistics

| Feature | Verified From | Status |
|---|---|---|
| Overview statistics page | `admin/pages/Overview.js` | ✅ Implemented |
| CSV export (students, payments) | `utils/csvExport.js` | ✅ Implemented |
| PDF report generation | `jspdf`, `jspdf-autotable` dependencies | ✅ Dependency present |

---

## SYSTEM FEATURES

| Feature | Verified From | Status |
|---|---|---|
| Email/password authentication | Firebase Auth, `AuthContext.js` | ✅ Implemented |
| Google OAuth authentication | Firebase Auth + popup, `AuthContext.js` | ✅ Implemented |
| Role-based access control (student / admin) | `App.js:RequireStudent()`, `App.js:RequireAdmin()` | ✅ Implemented |
| Branch isolation (frontend) | `BranchGuard`, branch-scoped Firestore paths | ✅ Implemented |
| Branch isolation (backend) | `requireAdmin` middleware — branchId binding | ✅ Implemented |
| Branch isolation (Firestore rules) | `isBranchAdmin(branchId)` — all branch collections | ✅ Implemented |
| Privilege escalation prevention | `noPrivilegedStatus()`, `isSafeUserSelfUpdate()` in rules | ✅ Implemented |
| Admin SDK write isolation | Support lesson registrations, payment rejection, corrections | ✅ Implemented |
| Image optimization (WebP) | `userService.js:uploadToSupabase()`, `utils/imageOptimizer.js` | ✅ Implemented |
| Rate limiting | express-rate-limit — general 300/15min, sensitive 30/15min | ✅ Implemented |
| Security headers | Helmet on Express backend | ✅ Implemented |
| Capacity enforcement | `firestoreService.js:assertClassNotFull()` | ✅ Implemented |
| Academic year calculation | `getCurrentAcademicYear()` — Sep 1 to Aug 31 | ✅ Implemented |
| User lifecycle management | `userLifecycleService.js` — active → inactive → archived | ✅ Implemented |
| Email verification flow | `sendEmailVerification`, `syncEmailVerificationIfNeeded()` | ✅ Implemented |
| Email resend rate limiting | 60-second cooldown, localStorage-tracked | ✅ Implemented |
| Scroll to top on route change | `App.js:ScrollToTop` | ✅ Implemented |
| RTL layout (Arabic) | `dir="rtl"` on root div | ✅ Implemented |
| Skip-to-content accessibility link | `App.js:PublicLayout` | ✅ Implemented |
| Error boundary (admin) | `AdminErrorBoundary.js` | ✅ Implemented |
| Error page (404) | `ErrorPage.js` | ✅ Implemented |
| Branch alias URLs | `/branchA` → boumerdes, `/branchB` → bordj_menaiel | ✅ Implemented |
| Migration script | `utils/migrationScript.js` | ✅ Present (verify use) |
| Storage cleanup service | `storageCleanupService.js` | ✅ Present |
| Supabase storage (photos, receipts) | `userService.js`, Supabase client | ✅ Implemented |
| Firestore real-time listeners (student) | `onSnapshot` — 7 concurrent listeners in dashboard | ✅ Implemented |
| Firestore real-time listeners (admin) | `onAdminSnapshot` in `adminService.js` | ✅ Implemented |
