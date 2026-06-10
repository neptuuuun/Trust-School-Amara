# AUDIT DOCUMENT 6 — QA TESTING CHECKLIST

**Legend:** ✅ Verifiable from code | ⚠️ Needs manual testing | ❌ Known issue

---

## MODULE 1: Branch Selection

### TC-1.1: First visit, no branch selected
- Steps: Open site with cleared localStorage
- Expected: Redirected to `/select-branch`
- Status: ✅ Verified in `App.js:RootRedirect`

### TC-1.2: Select branch, redirect to home
- Steps: Select Boumerdes branch on selection page
- Expected: `branchId=boumerdes` saved to localStorage, redirected to `/home`
- Status: ⚠️ Needs manual verification

### TC-1.3: Direct URL aliases
- Steps: Navigate to `/branchA`
- Expected: `branchId=boumerdes` set, redirect to `/home`
- Status: ✅ Verified in `App.js:BranchAlias`

### TC-1.4: Branch mismatch after login
- Steps: Login to Boumerdes branch; change localStorage to `bordj_menaiel`
- Expected: Redirect to `/login`
- Status: ✅ Verified in `App.js:BranchGuard`

---

## MODULE 2: Student Registration

### TC-2.1: Email/Password registration — happy path
- Steps: Go to `/register` → fill form → submit
- Expected: Firebase Auth user created, Firestore doc created with `status='email_pending'`, verification email sent
- Status: ✅ Verified in `AuthContext.js:signup()`

### TC-2.2: Registration without selecting branch
- Steps: Clear `branchId`, go to `/register`
- Expected: Redirected to `/select-branch`
- Status: ✅ Verified in `BranchGuard`

### TC-2.3: Registration with invalid branch ID
- Steps: Manually set `branchId` to an invalid value, attempt signup
- Expected: Error thrown "Invalid branchId"
- Status: ✅ Verified in `AuthContext.js:signup()` — `validBranches` check

### TC-2.4: Firestore failure rollback
- Steps: Simulate Firestore write failure during signup
- Expected: Firebase Auth user deleted, student can re-register with same email
- Risk: ⚠️ Hard to test manually; needs network throttling simulation

### TC-2.5: Duplicate email registration
- Steps: Register with an already-used email
- Expected: Firebase Auth error shown to user
- Status: ⚠️ Verify error message is user-friendly (not raw Firebase error code)

### TC-2.6: Google registration — new user
- Steps: Click "Sign in with Google" on `/register`, use new Google account
- Expected: Stub doc created with `completedProfile=false`, redirect to `/complete-registration`
- Status: ✅ Verified in `AuthContext.js:registerWithGoogle()`

### TC-2.7: Google registration — existing user
- Steps: Click "Sign in with Google" on `/register`, use already-registered Google account
- Expected: Existing profile loaded, no duplicate created
- Status: ✅ Verified in `googleAuthService.js:findUserAcrossBranches()`

### TC-2.8: Complete registration page
- Steps: After Google stub creation, fill complete-registration form with photos
- Expected: Photos uploaded to Supabase, `completedProfile=true`, `verificationStatus='pending'`
- Status: ⚠️ Needs manual testing — Supabase upload + Firestore update

---

## MODULE 3: Email Verification

### TC-3.1: Student blocked until email verified
- Steps: Register, skip email verification, try to access `/profile`
- Expected: Email verification screen shown with resend button
- Status: ✅ Verified in `App.js:RequireStudent`

### TC-3.2: Resend rate limit
- Steps: Click resend twice within 60 seconds
- Expected: Second click blocked with "wait X seconds" message
- Status: ✅ Verified in `AuthContext.js:resendVerificationEmail()` — localStorage rate limit

### TC-3.3: Email verification sync
- Steps: Verify email in another tab; return to app
- Expected: App detects verification within 10 seconds (polling interval)
- Status: ✅ Verified in `AuthContext.js` — 10-second interval polling

---

## MODULE 4: Login

### TC-4.1: Correct credentials
- Steps: Login with valid email/password
- Expected: User loaded, role set, redirect to `/profile`
- Status: ⚠️ Needs manual verification

### TC-4.2: Wrong password
- Steps: Login with wrong password
- Expected: User-friendly error shown (not raw Firebase error)
- Status: ⚠️ Verify error message localization

### TC-4.3: Login with unregistered email in branch
- Steps: Login with email that exists in Firebase Auth but not in selected branch's Firestore
- Expected: Signed out, error: "هذا الحساب غير مسجل"
- Status: ✅ Verified in `AuthContext.js:login()`

### TC-4.4: Admin login
- Steps: Go to `/admin/login`, login with admin credentials
- Expected: Role set to admin, redirect to `/admin/{branchId}`
- Status: ⚠️ Needs manual verification

### TC-4.5: Google login — no account
- Steps: Use "Sign in with Google" on `/login` with Google account that has no Firestore profile
- Expected: Signed out, error: "لا يوجد حساب مرتبط بهذا البريد"
- Status: ✅ Verified in `AuthContext.js:loginWithGoogle()`

---

## MODULE 5: Annual Fee Payment

### TC-5.1: Submit annual fee payment
- Steps: Logged in student → navigate to `/support-lessons` → select lesson → upload proof
- Expected: `annualPayments` doc created with `status='pending'`, dashboard shows "قيد المراجعة"
- Status: ⚠️ Needs manual testing

### TC-5.2: Admin verifies annual payment
- Steps: Admin sees payment in PaymentsVerification → clicks Verify
- Expected: Batch write succeeds: payment → verified, support registration created, user.yearlyFeePaid=true
- Status: ⚠️ Needs manual testing — critical path

### TC-5.3: Admin rejects annual payment
- Steps: Admin clicks Reject on a pending payment
- Expected: Payment status → rejected, Supabase receipt file deleted
- Status: ⚠️ Needs manual testing

### TC-5.4: Payment correction request
- Steps: Admin clicks "Request Correction" on annual payment
- Expected: Payment status → needs_correction, correction reason stored
- Status: ⚠️ Needs manual testing

### TC-5.5: Student resubmits corrected proof
- Steps: Student sees correction banner, uploads new proof
- Expected: New receipt uploaded, status → pending, correctionCount incremented
- Status: ⚠️ Needs manual testing

### TC-5.6: Student attempts to submit second annual payment
- Steps: Annual payment already verified; student tries to create a new one
- Expected: ⚠️ UNTESTED — no duplicate prevention found in client code (see Audit 7)

---

## MODULE 6: Support Lesson Registration

### TC-6.1: Register for support lesson after annual fee paid
- Steps: Annual fee verified → navigate to `/support-lesson-registration`
- Expected: Form shows available lessons, submission creates registration
- Status: ⚠️ Needs manual testing

### TC-6.2: Annual fee not paid — access blocked
- Steps: Annual fee unpaid → try to register for support lesson
- Expected: Gated — user redirected or shown "pay annual fee first"
- Status: ⚠️ Verify gate behavior in `SupportLessonRegistrationForm.js`

### TC-6.3: Class at capacity
- Steps: Fill a class to its `capacity` limit → attempt another registration
- Expected: `assertClassNotFull()` throws, user shown friendly capacity message
- Status: ⚠️ Needs manual testing — critical UX path

### TC-6.4: Subscription expiry display
- Steps: View a registration with a past `endDate`
- Expected: Registration shown as "expired" with "تجديد الاشتراك" link
- Status: ✅ Verified in `registrationUtils.js:getComputedStatus()`

---

## MODULE 7: Language Registration

### TC-7.1: Submit language registration form
- Steps: Login → `/language-registration` → select language/level → upload receipt → submit
- Expected: `languageFormEntries` doc created with `status='pending'`
- Status: ⚠️ Needs manual testing

### TC-7.2: Admin approves language registration
- Steps: Admin → LanguageRegisteredPage → click Approve
- Expected: Capacity checked, enrollmentCount incremented, entry approved, archive created, receipt deleted
- Status: ⚠️ Needs manual testing

### TC-7.3: Admin rejects language registration
- Steps: Admin → LanguageRegisteredPage → click Reject
- Expected: Entry status → rejected, receipt deleted from Supabase
- Status: ⚠️ Needs manual testing

### TC-7.4: Language class at capacity
- Steps: Fill language class to capacity → student attempts registration
- Expected: `assertClassNotFull()` blocks; admin sees class as full
- Status: ⚠️ Needs manual testing

---

## MODULE 8: Training Registration

### TC-8.1: Submit training registration
- Steps: Login → `/training-registration` → select training → upload proof → submit
- Expected: `trainingFormEntries` doc created with `status='pending'`
- Status: ⚠️ Needs manual testing

### TC-8.2: Admin approves training registration
- Steps: Admin → TrainingRegisteredPage → approve
- Expected: Archive created in `trainingsRegistered`
- Status: ⚠️ Needs manual testing

---

## MODULE 9: Admin Student Management

### TC-9.1: Admin creates student directly
- Steps: Admin → UsersPage → Create Student → fill form → submit
- Expected: Firebase Auth user created, Firestore profile with `verificationStatus='verified'`, student can login immediately
- Status: ⚠️ Needs manual testing — verify backend route

### TC-9.2: Admin approves pending student
- Steps: Admin → UsersPage → filter Pending → click Approve
- Expected: `verificationStatus` → `'verified'`
- Status: ⚠️ Needs manual testing

### TC-9.3: Admin deletes student
- Steps: Admin → UsersPage → delete student
- Expected: Firestore doc deleted (verify Firebase Auth user also handled)
- Risk: ⚠️ Check if Firebase Auth user is deleted — orphaned auth accounts are a security risk

---

## MODULE 10: Announcements

### TC-10.1: Admin creates announcement
- Steps: Admin → AnnouncementsPage → Create → fill → publish
- Expected: Announcement visible to students in their branch
- Status: ⚠️ Needs manual testing

### TC-10.2: Branch isolation of announcements
- Steps: Create announcement in Boumerdes; check as Bordj Menaiel student
- Expected: Announcement NOT visible to other branch
- Status: ✅ Verified in Firestore rules — `isBranchAdmin(branchId)` scoped

---

## MODULE 11: Logout

### TC-11.1: Student logout
- Steps: Click logout
- Expected: Firebase Auth signed out, `branchId` cleared from localStorage, redirect to `/select-branch` or `/login`
- Status: ✅ Verified in `AuthContext.js:logout()` + `resetBranch()`

### TC-11.2: Admin listener cleanup on logout
- Steps: Admin logs out
- Expected: Real-time admin listener unsubscribed — no stale listener memory leak
- Status: ✅ Verified in `AuthContext.js:logout()` — `adminListenerRef.current()`

---

## MODULE 12: Security

### TC-12.1: Student cannot access admin routes
- Steps: Login as student, navigate to `/admin/boumerdes`
- Expected: Redirect to `/home`
- Status: ✅ Verified in `App.js:RequireAdmin`

### TC-12.2: Admin cannot access another branch
- Steps: Admin for Boumerdes attempts API call with `branchId=bordj_menaiel`
- Expected: Backend `requireAdmin` middleware rejects with 403
- Status: ✅ Verified in middleware code

### TC-12.3: Student cannot self-approve payment
- Steps: Student attempts to write `status='verified'` to their annualPayment
- Expected: Firestore rule blocks update — only admin can update annualPayments
- Status: ✅ Verified in firestore.rules

### TC-12.4: Student cannot set their role to admin
- Steps: Student attempts to write `role='admin'` to their profile
- Expected: `isSafeUserSelfUpdate()` blocks — role change rejected
- Status: ✅ Verified in firestore.rules

### TC-12.5: Unauthenticated access to protected routes
- Steps: Clear session, navigate to `/profile`
- Expected: Redirect to `/login`
- Status: ✅ Verified in `App.js:RequireStudent`
