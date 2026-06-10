# AUDIT DOCUMENT 7 — UNTESTED AREAS & RISK REPORT

**Severity ratings: CRITICAL / HIGH / MEDIUM / LOW**

---

## CRITICAL RISKS

---

### RISK-C1: No Duplicate Annual Payment Prevention (Client Side)
**Severity:** CRITICAL  
**Location:** `StudentDashboard.js`, `SupportLessonRegistrationForm.js`  
**Description:** A student who has already submitted an annual payment (`status=pending`) can navigate back to the support lesson registration form and submit another payment. There is no client-side check blocking a second submission when one is already pending or verified.  
**Impact:** Admin sees duplicate payments; potential for confusion or double-charging.  
**Test Case:**
1. Submit annual fee payment (status=pending)
2. Navigate back to `/support-lessons` → `/support-lesson-registration`
3. Submit another payment
4. Observe: second `annualPayments` doc created

**Fix Recommendation:** Before showing the registration form, check if an annual payment already exists with `status !== 'rejected'` and block submission with a clear message.

---

### RISK-C2: Firebase Auth User Not Deleted When Admin Deletes Student
**Severity:** CRITICAL  
**Location:** `UsersPage.js`, backend delete route  
**Description:** When an admin deletes a student from the Firestore database, the corresponding Firebase Authentication account is likely not deleted. This leaves an orphaned Auth account that the student can still use to sign in, potentially triggering listener errors or creating inconsistent state.  
**Impact:** Security risk — deleted students may still be able to authenticate. Data integrity issue.  
**Fix Recommendation:** Admin student delete must call the Firebase Admin SDK `deleteUser()` API via the backend, not just delete the Firestore document.

---

### RISK-C3: Capacity Enforcement Not Enforced in Firestore Rules
**Severity:** CRITICAL  
**Location:** `firestore.rules`, `firestoreService.js:assertClassNotFull()`  
**Description:** Class capacity enforcement happens in `firestoreService.js:assertClassNotFull()`, which reads the class document and checks `enrollmentCount < capacity` before proceeding. However, this check is not enforced by Firestore rules. A malicious client could bypass the service layer and write directly to Firestore, enrolling in a full class or incrementing enrollment past capacity.  
**Impact:** Classes could exceed capacity limits.  
**Fix Recommendation:** Consider adding a Firestore rule that blocks enrollment if `enrollmentCount >= capacity` — or rely exclusively on the backend Admin SDK for all enrollment writes (which bypasses client rules but is controlled by server logic).

---

## HIGH RISKS

---

### RISK-H1: Email Service Not Configured
**Severity:** HIGH  
**Location:** `src/services/emailService.js`  
**Description:** The email service exists in code but has no credentials, no template IDs, and no service ID configured. Students receive no email confirmation on registration (beyond Firebase's own verification email). Admins receive no notifications.  
**Impact:** Students have no confirmation emails after submitting registrations. Admins cannot receive notifications of new registrations.  
**Test Case:** Complete a registration → check if any transactional email is sent.

---

### RISK-H2: Storage Cleanup Is Not Atomic
**Severity:** HIGH  
**Location:** `firestoreService.js:rejectLanguageRegistration()`, `rejectAnnualPayment()`  
**Description:** When a registration is rejected, the receipt file is deleted from Supabase storage in a best-effort call. If the deletion fails (network error, Supabase outage), the Firestore document is already updated to `status='rejected'` but the receipt file remains in storage indefinitely.  
**Impact:** Orphaned files accumulate in Supabase storage. Potential privacy issue (old payment proofs retained).  
**Fix Recommendation:** Track Supabase storage paths in Firestore. Run a scheduled cleanup job that finds rejected registrations with a non-null `receiptPath` and retries deletion.

---

### RISK-H3: Backend URL Hardcoded in .env for Local Development
**Severity:** HIGH  
**Location:** `.env: REACT_APP_BACKEND_URL=http://localhost:3001`  
**Description:** The backend URL points to localhost. If the build is deployed without changing this value, all Admin SDK operations (payment verification, student creation, etc.) will fail silently in production.  
**Impact:** All admin actions requiring the backend will fail in production.  
**Fix Recommendation:** Use environment-specific `.env` files: `.env.production` with the real backend URL, `.env.development` for local. Verify during deployment.

---

### RISK-H4: API Keys Committed to Repository
**Severity:** HIGH  
**Location:** `.env`, `.env.local`  
**Description:** Firebase API key, Supabase anon key, and Supabase URL are committed in `.env` files. If the repository is or ever becomes public, these credentials are exposed.  
**Impact:** Firebase project could be abused (Firestore reads, Auth spam). Supabase storage accessed directly.  
**Fix Recommendation:** Rotate all keys immediately. Add `.env` to `.gitignore` (already present). Use CI/CD secret injection for production builds. Note: Firebase API key is technically semi-public for client apps (Firestore rules are the real protection), but the Supabase service key should never be committed.

---

### RISK-H5: No Server-Side Payment Amount Validation
**Severity:** HIGH  
**Location:** `annualPayments` create path in Firestore rules  
**Description:** Students can set any `amount` value when creating an annual payment document. There is no rule or backend validation that enforces the correct fee amount (e.g., 1000 DZD). A student could submit a payment with `amount=1` and it would pass Firestore rules.  
**Impact:** Admin must manually verify the amount shown in the proof matches the expected fee. System cannot auto-validate amounts.  
**Fix Recommendation:** Use the backend to create annual payment documents (Admin SDK) instead of allowing client-side creation, OR add a Firestore rule: `request.resource.data.amount == expectedAmount`.

---

## MEDIUM RISKS

---

### RISK-M1: `firestoreService.js` Is 3000+ Lines — Unmaintainable Monolith
**Severity:** MEDIUM  
**Location:** `src/services/firestoreService.js`  
**Description:** All database operations are in a single 3037-line file. This increases merge conflict risk, makes testing impossible, and makes it hard to understand the impact of any change.  
**Impact:** Maintenance burden. Any change risks breaking unrelated functionality.  
**Fix Recommendation:** Split into domain-specific service files: `languageService.js`, `trainingService.js`, `paymentService.js`, `supportLessonService.js`, etc.

---

### RISK-M2: Legacy Field Proliferation in User Documents
**Severity:** MEDIUM  
**Location:** `branches/{branchId}/users/{uid}` schema  
**Description:** The user document contains multiple overlapping fields for the same data: `verified` + `accountVerified` + `verificationStatus`; `phone` + `phoneNumber` + `guardianPhone`. The code auto-migrates legacy `verified=true` → `verificationStatus='verified'` but the migration is silent and scattered across snapshot callbacks.  
**Impact:** Inconsistent data across documents. Code must handle multiple field names defensively everywhere.  
**Fix Recommendation:** Run a one-time migration script to normalize all user documents to the canonical schema. Remove legacy field fallbacks from code after migration.

---

### RISK-M3: `listenersSetupRef` Prevents Re-initialization on Navigation
**Severity:** MEDIUM  
**Location:** `StudentDashboard.js:listenersSetupRef`  
**Description:** A ref flag (`listenersSetupRef.current`) prevents listeners from being set up twice. However, if a student navigates away and back to the dashboard without a full unmount/remount, the listeners may not re-initialize correctly on subsequent visits.  
**Impact:** Stale data displayed on return to dashboard.  
**Test Case:** Visit `/profile` → navigate to `/home` → navigate back to `/profile` — verify data is fresh.

---

### RISK-M4: Rate Limiting Is IP-Based, Not User-Based
**Severity:** MEDIUM  
**Location:** `backend/server.js` — `express-rate-limit`  
**Description:** Rate limiting is applied per IP address (30 req/15min for sensitive routes). Behind a shared network (NAT, university network), all students share the same IP limit. One student's heavy usage could block others.  
**Impact:** Legitimate users could be rate-limited due to other users' activity on the same network.  
**Fix Recommendation:** Implement user-based rate limiting using Firebase UID as the key (available from `req.user.uid` after token verification).

---

### RISK-M5: No Pagination on Admin Lists
**Severity:** MEDIUM  
**Location:** `UsersPage.js`, `PaymentsVerification.js`, `LanguageRegisteredPage.js`  
**Description:** Admin pages load all documents for their branch at once (no Firestore pagination). As the branch grows, this will cause slow page loads and increasing Firestore read costs.  
**Impact:** Degraded performance at scale. Increased Firebase costs.  
**Fix Recommendation:** Implement cursor-based pagination using Firestore's `startAfter()` and `limit()` for all admin list pages.

---

### RISK-M6: Supabase Storage Paths Inconsistently Stored
**Severity:** MEDIUM  
**Location:** `userService.js`, `firestoreService.js`  
**Description:** Receipt URLs are stored in Firestore, but the storage paths needed for deletion are sometimes stored and sometimes derived. If URL format changes, deletion will fail.  
**Impact:** Failed storage cleanup on payment rejection.  
**Fix Recommendation:** Always store both `receiptUrl` (for display) and `receiptPath` (for deletion) as separate fields in every document that has a receipt.

---

## LOW RISKS

---

### RISK-L1: Some Error Messages May Leak Internal Details
**Severity:** LOW  
**Location:** Various login/registration error handlers  
**Description:** Some Firebase Auth error codes (e.g., `auth/email-already-in-use`) may be shown directly to users without sanitization.  
**Impact:** Minimal — reveals whether an email is registered. For a school application, this is low risk.  
**Fix Recommendation:** Map all Firebase error codes to Arabic user-friendly messages.

### RISK-L2: `migrationScript.js` Has No Safeguards
**Severity:** LOW  
**Location:** `src/utils/migrationScript.js`  
**Description:** Migration scripts are in the client-side source tree with no execution guards. If accidentally imported or triggered from the browser, they could modify production data.  
**Fix Recommendation:** Move migration scripts to a separate `scripts/` directory outside `src/`. Run them from Node.js CLI only, not from the browser.

### RISK-L3: Console Logs Left in Production Code
**Severity:** LOW  
**Location:** `AuthContext.js`, `StudentDashboard.js` — many `console.log()` calls  
**Description:** Detailed auth state logs are left in the codebase. These expose session details in browser devtools.  
**Fix Recommendation:** Strip `console.log` calls from production builds using a Babel plugin or environment check.

### RISK-L4: Announcement Public Read Requires Authentication
**Severity:** LOW  
**Location:** `firestore.rules: announcements` — `allow read: if isAuthenticated()`  
**Description:** Announcements require authentication to read. Public visitors (not logged in) cannot see branch announcements on public pages. This may be intentional but limits marketing use.  
**Impact:** Minor — announcements are not visible on public-facing pages to unauthenticated visitors.

### RISK-L5: No Mobile Testing Evidence
**Severity:** LOW  
**Description:** The UI uses Tailwind CSS with responsive classes, but no evidence of mobile testing or responsive design validation exists. The Arabic RTL layout may have issues on small screens.  
**Fix Recommendation:** Test on actual mobile devices or browser devtools mobile simulation for all main flows.
