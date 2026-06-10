# AUDIT DOCUMENT 10 — UI / PAGE DOCUMENTATION

**All pages verified from route definitions in `App.js` and component files.**

---

## PUBLIC PAGES (No login required)

---

### Branch Selector (`/select-branch`)
**File:** `src/pages/BranchSelector.js`  
**Purpose:** First page a new visitor sees. Allows selection of branch (Boumerdes or Bordj Menaiel).  
**Access:** Anyone  
**Actions:** Select a branch → saves to localStorage → redirects to `/home`  
**Collections:** `branches` (reads all branch docs for display)  
**Notes:** Also accessible at `/branch-selector` (alias, redirects here)

---

### Home Page (`/home`)
**File:** `src/pages/HomePage.js`  
**Purpose:** Landing page for the selected branch. Shows school information, services, announcements.  
**Access:** Anyone (branch must be selected)  
**Actions:** Navigate to other sections, see announcements  
**Collections:** `branches/{branchId}/announcements`  
**Notes:** RTL layout, Arabic UI

---

### Languages Page (`/languages`)
**File:** `src/pages/LanguagesPage.js`  
**Purpose:** Public catalog of available language courses.  
**Access:** Anyone  
**Actions:** Browse language offerings, see prices and levels  
**Collections:** `branches/{branchId}/languages`

---

### Support Lessons Page (`/support-lessons`)
**File:** `src/pages/SupportLessonsPage.js`  
**Purpose:** Browse available support lesson subjects.  
**Access:** Anyone  
**Actions:** Browse by level (middle/high school)  
**Collections:** `branches/{branchId}/subjects`, `branches/{branchId}/classes`  
**Notes:** Also accessible at `/support` (alias)

---

### Support Lessons by Level/Year (`/support-lessons/:level/:year`)
**File:** `src/pages/YearPage.js`  
**Purpose:** Drill-down view of support lessons for a specific school level and year.  
**Access:** Anyone  
**Actions:** See available classes, teachers, schedules  
**Collections:** `branches/{branchId}/classes`, `branches/{branchId}/subjects`, `branches/{branchId}/teachers`

---

### Trainings Page (`/trainings`)
**File:** `src/pages/TrainingsPage.js`  
**Purpose:** Public catalog of training courses.  
**Access:** Anyone  
**Actions:** Browse training offerings  
**Collections:** `branches/{branchId}/trainings`  
**Notes:** Also accessible at `/formation` (alias)

---

### Contact Page (`/contact`)
**File:** `src/pages/ContactPage.js`  
**Purpose:** School contact information.  
**Access:** Anyone  
**Actions:** View contact details, phone, address  
**Collections:** None (static content)

---

### Internal Rules Page (`/internal-rules`)
**File:** `src/pages/InternalRulesPage.js`  
**Purpose:** Display the school's internal rules that students must accept before registering.  
**Access:** Anyone  
**Actions:** Read rules (acceptance happens during registration)  
**Collections:** None (static content)

---

## AUTH PAGES

---

### Login Page (`/login`)
**File:** `src/pages/LoginPage.js`  
**Purpose:** Student login.  
**Access:** Unauthenticated only (redirects logged-in users)  
**Actions:** Email/password login, Google sign-in  
**Collections:** `branches/{branchId}/users/{uid}` (read to verify branch membership)  
**Notes:** Google sign-in on this page is for existing users only (does not create new accounts)

---

### Register Page (`/register`)
**File:** `src/pages/RegisterPage.js`  
**Purpose:** New student registration.  
**Access:** Unauthenticated (branch must be selected first)  
**Actions:** Email/password signup, Google sign-up (creates stub)  
**Collections:** `branches/{branchId}/users/{uid}` (creates document)  
**Notes:** Internal rules acceptance required

---

### Admin Login (`/admin/login`)
**File:** `src/admin/AdminLogin.js`  
**Purpose:** Separate login page for administrators.  
**Access:** Anyone (separate from student login)  
**Actions:** Admin email/password login  
**Collections:** `/admins/{uid}` (read to verify admin status)  
**Notes:** Successful login redirects to `/admin/{branchId}`

---

### Complete Registration (`/complete-registration`)
**File:** `src/pages/CompleteRegistrationPage.js`  
**Purpose:** Second step for Google sign-up users. Collects mandatory fields not provided by Google.  
**Access:** Authenticated users with `completedProfile === false`  
**Actions:** Enter birth date, phone, address, study year; upload profile photo and ID card  
**Collections:** `branches/{branchId}/users/{uid}` (updates with complete data)  
**Related Services:** `googleAuthService.js:completeGoogleProfile()`, `userService.js:uploadToSupabase()`

---

## STUDENT PAGES (Login + email verified + approved required)

---

### Student Dashboard (`/profile`)
**File:** `src/pages/StudentDashboard.js`  
**Purpose:** Main student self-service page. Shows all registrations, payments, and status.  
**Access:** Verified students only  
**Actions:**
- View/edit profile information
- View annual fee status
- View support lesson subscriptions (with expiry)
- View language registrations (approved/pending/rejected)
- View training registrations (approved/pending/rejected)
- Upload/resubmit payment correction
- Re-submit verification documents
- See personalized announcements
- See payment correction banners
**Collections (7 concurrent real-time listeners):**
1. `branches/{branchId}/users/{uid}` — student profile
2. `branches/{branchId}/annualPayments` (filtered by userId) — annual fee status
3. `supportLessonRegistrations` (filtered by userId) — monthly subscriptions
4. `branches/{branchId}/languagesForms/{uid}/languageFormEntries` — language forms
5. `branches/{branchId}/trainingsForms/{uid}/trainingFormEntries` — training forms
6. `branches/{branchId}/languagesRegistered` (filtered by userId) — approved languages
7. `branches/{branchId}/trainingsRegistered` (filtered by userId) — approved trainings
+ `notifications` — in-app notifications
+ `branches/{branchId}/payments` (filtered by userId)

**Notes:** Also accessible at `/student-dashboard` (redirects here). Contains study year backfill logic for legacy support registrations.

---

### Language Registration Form (`/language-registration`)
**File:** `src/components/LanguageRegistrationForm.js`  
**Purpose:** Student registers for a language course.  
**Access:** Verified students  
**Actions:** Select language and level, upload payment receipt, submit form  
**Collections:**
- `branches/{branchId}/languages` (read — catalog)
- `branches/{branchId}/classes` (read — available classes)
- `branches/{branchId}/languagesForms/{uid}/languageFormEntries` (write — creates entry)
**Related Services:** `userService.js:uploadSupportLessonPaymentProof()`

---

### Support Lesson Registration Form (`/support-lesson-registration`)
**File:** `src/components/SupportLessonRegistrationForm.js`  
**Purpose:** Student registers for a monthly support lesson subscription.  
**Access:** Verified students with annual fee paid  
**Actions:** Select lesson, upload payment proof, submit  
**Collections:**
- `branches/{branchId}/subjects`, `classes` (read)
- `annualPayments` (checks annual fee status)
**Related Services:** Backend API for registration creation (Admin SDK required)

---

### Training Registration Form (`/training-registration`)
**File:** `src/components/TrainingRegistrationForm.js`  
**Purpose:** Student registers for a training course.  
**Access:** Verified students  
**Actions:** Select training, upload payment receipt, submit form  
**Collections:**
- `branches/{branchId}/trainings` (read)
- `branches/{branchId}/trainingsForms/{uid}/trainingFormEntries` (write)

---

### Course Registration (`/course-registration`)
**File:** `src/pages/CourseRegistrationPage.js`  
**Purpose:** Course enrollment page (legacy route).  
**Access:** Verified students  
**Collections:** `branches/{branchId}/subjects`, `branches/{branchId}/classes`

---

### Payment Page (`/payment`)
**File:** `src/pages/PaymentPage.js`  
**Purpose:** Payment upload page.  
**Access:** Verified students  
**Collections:** `branches/{branchId}/payments`

---

### Registration Confirmation (`/registration-confirmation`)
**File:** `src/pages/RegistrationConfirmationPage.js`  
**Purpose:** Success page shown after completing a registration.  
**Access:** Verified students  
**Collections:** None (reads state from navigation)

---

## ADMIN PAGES (`/admin/*`)

All admin pages are inside `AdminDashboard.js` which acts as a shell with sub-routes.

---

### Admin Dashboard Shell (`/admin/*`)
**File:** `src/admin/AdminDashboard.js`  
**Purpose:** Main admin layout with sidebar navigation.  
**Access:** Authenticated admins only  
**Components:** Sidebar, breadcrumb, toast notifications, error boundary

---

### Overview (`/admin/{branchId}/overview`)
**File:** `src/admin/pages/Overview.js`  
**Purpose:** Summary statistics for the branch.  
**Actions:** View total students, pending verifications, payment stats  
**Collections:** Multiple branch collections for counts

---

### Users/Students (`/admin/{branchId}/users`)
**File:** `src/admin/pages/UsersPage.js`  
**Purpose:** Full student management page.  
**Actions:**
- List, search, filter students
- View student profile and documents
- Approve/reject accounts
- Create students (AdminCreateStudentModal)
- Edit student data
- Delete students
- Export CSV
- Print records
- View student's payment history
**Collections:** `branches/{branchId}/users`

---

### Payments Verification (`/admin/{branchId}/payments`)
**File:** `src/admin/pages/PaymentsVerification.js`  
**Purpose:** Review and verify annual fee payments.  
**Actions:**
- View pending payments
- View payment proof images (PaymentProofViewer)
- Approve payments
- Reject payments
- Request payment correction
**Collections:** `branches/{branchId}/annualPayments`

---

### Annual Fees (`/admin/{branchId}/annual-fees`)
**File:** `src/admin/pages/AnnualFees.js`  
**Purpose:** Annual fee management and history.  
**Collections:** `branches/{branchId}/annualFees`, `branches/{branchId}/annualPayments`

---

### Languages Catalog (`/admin/{branchId}/languages`)
**File:** `src/admin/pages/LanguagesPage.js`  
**Purpose:** Manage language course offerings.  
**Actions:** Create, edit, delete language entries (AddEditLanguageModal)  
**Collections:** `branches/{branchId}/languages`

---

### Language Registrations (`/admin/{branchId}/languages/registered`)
**File:** `src/admin/pages/LanguageRegisteredPage.js`  
**Purpose:** Review and approve language registration forms.  
**Actions:** Approve/reject registrations (with capacity check)  
**Collections:** `branches/{branchId}/languagesForms` (collection-group query)

---

### Trainings Catalog (`/admin/{branchId}/trainings`)
**File:** `src/admin/pages/TrainingsPage.js`  
**Purpose:** Manage training offerings.  
**Actions:** Create, edit, delete training entries (AddEditTrainingModal)  
**Collections:** `branches/{branchId}/trainings`

---

### Training Registrations (`/admin/{branchId}/trainings/registered`)
**File:** `src/admin/pages/TrainingRegisteredPage.js`  
**Purpose:** Review training registration forms.  
**Collections:** `branches/{branchId}/trainingsForms` (collection-group query)

---

### Training Requests (`/admin/{branchId}/trainings/requests`)
**File:** `src/admin/pages/TrainingRequestsPage.js`  
**Purpose:** Review student training interest requests.  
**Collections:** `branches/{branchId}/trainingRequests`

---

### Support Lessons — Middle School (`/admin/{branchId}/support-middle`)
**File:** `src/admin/pages/SupportLessonsMiddlePage.js`  
**Purpose:** Manage middle school support lesson classes.  
**Actions:** Create/edit classes, assign teachers, set capacity  
**Components:** SubjectClassManager, SubjectFormModal, ClassFormModal, TeacherManagerModal  
**Collections:** `branches/{branchId}/subjects`, `classes`, `teachers`

---

### Support Lessons — High School (`/admin/{branchId}/support-high`)
**File:** `src/admin/pages/SupportLessonsHighPage.js`  
**Purpose:** Manage high school support lesson classes.  
**Collections:** Same as Middle School

---

### Support Registrations (`/admin/{branchId}/support/registered`)
**File:** `src/admin/pages/SupportRegisteredPage.js`  
**Purpose:** View and manage all support lesson registrations.  
**Actions:** Verify/reject, add/edit registrations (AddSupportStudentModal, EditSupportRegistrationModal)  
**Collections:** `supportLessonRegistrations` (global), `branches/{branchId}/registrations`

---

### Announcements (`/admin/{branchId}/announcements`)
**File:** `src/admin/pages/AnnouncementsPage.js`  
**Purpose:** Create and manage branch announcements.  
**Actions:** Create/edit/delete announcements (AnnouncementFormModal)  
**Collections:** `branches/{branchId}/announcements`

---

### Admin Guide (`/admin/{branchId}/guide`)
**File:** `src/admin/pages/AdminGuide.js`  
**Purpose:** Built-in admin help documentation.  
**Access:** Admin only  
**Collections:** None (static content)

---

## ERROR PAGE

### 404 Not Found (`*`)
**File:** `src/components/ErrorPage.js`  
**Purpose:** Catch-all page for unmatched routes.  
**Actions:** Display error message, link back to home
