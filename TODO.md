# Task: Update School Website with Branches, Dashboards, Payments, etc.

## Current Work
Analyzing the existing codebase to understand structure and plan updates. Key files reviewed: firebase.js, StudentDashboard.js, UnifiedRegistrationForm.js, App.js, RegisterPage.js, AuthContext.js, BranchContext.js, AdminDashboard.js, Payments.js, Students.js.

## Key Technical Concepts
- React with Hooks, React Router for routing.
- Firebase: Auth, Firestore ('users', 'students', 'payments', 'studentSubjects'), Storage for uploads.
- Contexts: AuthContext (user/role), BranchContext (branches/pricing).
- UI: Lucide React icons, Tailwind CSS.
- Forms: React Hook Form in some components.
- Protected routes with role checks.

## Relevant Files and Code
- src/firebase.js: Firebase init with auth, db, storage.
- src/pages/StudentDashboard.js: Queries 'students' by userId, shows enrolled subjects from 'studentSubjects', payments from 'payments'. Needs profile pic/ID display, payment history updates.
  - Example: onSnapshot for student data: query(collection(db, 'students'), where('userId', '==', user.uid))
- src/components/UnifiedRegistrationForm.js: Course signups to 'signups' collection, no auth/userId.
- src/App.js: Routes with ProtectedRoute (adminOnly prop), student-dashboard protected.
- src/pages/RegisterPage.js: Signup calls AuthContext.signup, stores to 'users' with branchId.
  - Example: payload = { uid, email, role: 'student', name, branchId, ... }
- src/contexts/AuthContext.js: onAuthStateChanged loads role from 'users'. signup creates user and sets doc.
- src/contexts/BranchContext.js: Hardcoded branches array, localStorage persistence.
- src/admin/AdminDashboard.js: Sidebar with routes to admin pages like Payments, Students.
- src/admin/pages/Payments.js: Queries 'payments', filters, approve/reject updates status.
  - Example: updateDoc with { status: 'approved', reviewedAt: new Date() }
- src/admin/pages/Students.js: Queries 'students', filters by branch/status, modal shows profile/ID photos.

## Problem Solving
- Data sync: 'users' vs 'students' – Merge into 'users' for simplicity, update queries.
- Branches: Move to Firestore, load dynamically in BranchContext.
- Uploads: Add file inputs in RegisterPage, use storage.ref().put() to upload, store URLs in user doc.
- Payments: Restructure schema in creation (e.g., in PaymentUploadForm, not shown but referenced). Add type, month, branchId. Logic for monthly (support) vs one-time.
- First-time fee: In enrollment/payment, check !user.firstSupportPaymentDone, add 1000 fee, set flag on approval.
- Dashboard: Compute last paid month/next due from payments query (filter by type='support', orderBy month desc).
- Admin: Add branch filter to Students/Payments queries using where('branchId', '==', selectedBranch).
- Routing: Enhance ProtectedRoute to check role and branch if admin.

## Pending Tasks and Next Steps
1. [x] Update BranchContext to load branches from Firestore 'branches' collection. Create sample data via execute_command or manual (but since no CLI for Firestore, suggest user adds via console).
   - "Load branches from Firestore on mount, replace hardcoded array."
2. Create 'branches' collection in Firestore (user to add 2 docs via Firebase console: branch1/branch2 with schema).
3. [x] Update RegisterPage: Add file uploads for profile pic/ID. On submit, upload to storage ('users/{uid}/profile.jpg', 'users/{uid}/id.jpg'), get URLs, add to payload.
   - "Integrate storage uploads, require uploads before signup completion."
4. [x] Update AuthContext.signup: Include profilePictureUrl, idCardUrl, firstSupportPaymentDone: false in signup payload.
5. [x] Sync 'students' to 'users': Migrate or update queries in StudentDashboard to use 'users' collection directly (where('uid', '==', user.uid)).
   - "Standardize on 'users' collection for student data."
6. [x] Update StudentDashboard:
   - Display branch from user.branchName, profile pic (<img src={user.profilePictureUrl}>), ID card link/view.
   - My Courses: Already from 'studentSubjects', add branchId if missing.
   - Payments: Query 'payments' where('userId', '==', user.uid). For support: find max month where status='approved', compute next = add 1 month. Show "One-time payment" for training/language.
   - "Add last paid/next due logic: Use date-fns or manual for month calc."
7. Update Payment System:
   - In PaymentUploadForm (need to read/create if missing): On upload, create payment doc with new schema {userId, branchId: user.branchId, courseId, amount, type, month (for support), status: 'pending', createdAt/updatedAt}.
   - For first support: If !user.firstSupportPaymentDone && type='support', amount += 1000, note='Registration Fee Included'.
   - Admin Payments.js: Update schema handling, filter by branch (add where if selected).
   - On approve: If first support, update user.firstSupportPaymentDone = true.
   - "Restructure payment creation/approval logic."
8. Update Admin:
   - Students.js: Already filters by branch, add ID card view in modal (img src).
   - Payments.js: Add branch filter (select branch, query where('branchId', '==')).
   - Make admin branch-aware: Add branch selector in AdminDashboard, pass to pages.
   - "Enhance filtering, add branch context for admin."
9. Routing Fix:
   - ProtectedRoute: For student routes, check role==='student'. For admin/*, role==='admin' and perhaps branch selected.
   - Separate admin routes, redirect if wrong role.
   - "Update ProtectedRoute component to enforce roles strictly."
10. Enrollment Forms (e.g., UnifiedRegistrationForm): Add userId: auth.currentUser.uid, branchId: user.branchId to signup doc. For support, include month.
    - "Attach branchId to all enrollments/payments."

After plan approval, proceed step-by-step: Update contexts first, then registration, then dashboards, test with browser_action.
