# School Website - Complete System Flow Guide

## 🎯 Overview
This guide explains the complete flow from student registration to course access, including all verification steps and admin processes.

## 📊 Database Structure

### Branch-Scoped Collections
All data is organized per branch for proper separation:

```
branches/
  {branchId}/
    ├── users/                  # Firebase Auth users (for login)
    │   └── {userId}/
    │       ├── email
    │       ├── role: "student"
    │       ├── branchId
    │       ├── verified: false
    │       └── yearlyFeePaid: false
    │
    ├── students/              # Student profiles with verification data
    │   └── {docId}/
    │       ├── userId
    │       ├── fullName
    │       ├── email
    │       ├── studentPhone
    │       ├── profilePhotoUrl
    │       ├── nationalIdPhotoUrl
    │       ├── verified: false
    │       ├── yearlyFeePaid: false
    │       └── createdAt
    │
    ├── signups/               # Course registration requests
    │   └── {docId}/
    │       ├── userId
    │       ├── name
    │       ├── email
    │       ├── phone
    │       ├── courseType: "language" | "support" | "training"
    │       ├── courseName
    │       ├── status: "pending" | "approved" | "rejected"
    │       └── createdAt
    │
    ├── training_requests/     # Training requests (طلب تدريب)
    │   └── {docId}/
    │       ├── name
    │       ├── phone
    │       ├── email
    │       ├── course
    │       ├── status: "pending" | "approved" | "rejected"
    │       └── createdAt
    │
    ├── annualFees/           # Annual fee submissions (الرسوم السنوية)
    │   └── {docId}/
    │       ├── userId
    │       ├── level
    │       ├── schoolName
    │       ├── subjects: []
    │       ├── amount: 1000
    │       ├── screenshotUrl
    │       ├── status: "pending" | "approved" | "rejected"
    │       └── createdAt
    │
    ├── payments/             # All payment records
    │   └── {docId}/
    │       ├── userId
    │       ├── type: "yearlyFee" | "supportLesson" | "language" | "training"
    │       ├── amount
    │       ├── screenshotUrl
    │       ├── status: "pending" | "approved" | "rejected"
    │       └── createdAt
    │
    ├── languageCourses/      # Available language courses
    ├── supportLessons/       # Available support lessons
    └── trainings/            # Available training courses
```

## 🔄 Complete User Flow

### 1️⃣ Student Registration (RegisterPage.js)

**Student Actions:**
1. Student visits `/register`
2. Selects branch (required first step)
3. Fills out registration form:
   - Full name, email, password
   - Birth date, birth place, address
   - Phone number
   - Uploads profile picture
   - Uploads national ID card photo
4. Submits form

**System Actions:**
1. Creates Firebase Auth account
2. Creates user document in `branches/{branchId}/users/` with:
   - `verified: false`
   - `yearlyFeePaid: false`
3. Creates student document in `branches/{branchId}/students/` with:
   - All student info
   - Uploaded photo URLs
   - `verified: false`
   - `yearlyFeePaid: false`
4. Redirects to student dashboard

**Student Status:** ❌ Not verified, cannot register for courses yet

---

### 2️⃣ Admin Verification (VerificationPanel.js)

**Admin Access:** `/admin` → Verification Panel

**Admin Actions:**
1. Views all students waiting for verification
2. Sees:
   - Student name, email, phone
   - Profile photo
   - National ID card photo
   - Registration date
3. Clicks on ID photo to view full size
4. Decides: **Approve** or **Reject**

**If Admin Approves:**
- Updates student record: `verified: true`
- Creates yearly fee payment record: `yearlyFeePaid: true`
- Student can now register for courses (except support lessons until yearly fee paid)

**If Admin Rejects:**
- Updates student record: `verified: false`
- Student cannot access courses

**Student Status:** ✅ Verified, can register for languages and trainings

---

### 3️⃣ Course Registration Flow

#### A. Language Course Registration

**Requirements:**
- ✅ Student must be verified

**Student Actions:**
1. Browse language courses
2. Select course and level
3. Fill registration form (UnifiedRegistrationForm)
4. Choose payment method (CCP/BaridiMob)
5. Make payment via chosen method
6. Send screenshot to WhatsApp
7. Submit registration

**System Actions:**
1. Checks if student is verified
2. Creates signup in `branches/{branchId}/signups/`
3. Shows success message

**Admin Actions:**
1. Views signup in "طلبات التسجيل"
2. Verifies payment screenshot
3. Approves or rejects

**Result:** Student gets access to language course

---

#### B. Support Lessons Registration

**Requirements:**
- ✅ Student must be verified
- ✅ Student must have paid yearly fee (1000 DZD)
- 💰 Monthly payment required for each month

**Yearly Fee Payment (First Time):**
1. Student goes to `/annual-fees` or uses YearlyFeeForm
2. Fills out:
   - Education level, stream, school name
   - Subjects (comma-separated)
   - Parent and student phone numbers
   - Payment method (CCP/BaridiMob)
   - Transaction details
   - Upload payment receipt
3. Submits form

**System Actions:**
1. Saves to `branches/{branchId}/annualFees/`
2. Also creates payment record in `branches/{branchId}/payments/`

**Admin Actions (Annual Fees Page):**
1. Goes to `/admin/annual-fees`
2. Views all annual fee submissions
3. Sees:
   - Student level, school, subjects
   - Payment receipt image
   - All details
4. Approves or rejects
5. **On Approval:**
   - Updates `annualFees` status to "approved"
   - Updates student: `yearlyFeePaid: true`
   - Updates payment status to "approved"

**Monthly Support Lesson Registration:**
1. Student registers for support lesson (like language registration)
2. **Must upload monthly payment proof**
3. Admin verifies each month's payment
4. Student gets access for that month

**Result:** Student gets access to support lessons

---

#### C. Training Registration

**Requirements:**
- ✅ Student must be verified

**Student Actions:**
1. Browse training courses
2. Register using UnifiedRegistrationForm
3. Pay and submit payment proof

**Admin Actions:**
1. Reviews training registration
2. Approves or rejects

**Result:** Student gets access to training course

---

#### D. Training Request (When No Training Available)

**Student Actions:**
1. Clicks "طلب مدرب" button
2. Fills TrainingRequestForm:
   - Name, email, phone
   - Requested course/field
   - Additional message
3. Submits

**System Actions:**
- Saves to `branches/{branchId}/training_requests/`

**Admin Actions:**
1. Views in "طلبيات الدورات التكوينية" or Students page
2. Reviews request
3. Approves (will create training) or rejects
4. Contacts student directly

**Result:** Admin may create new training based on request

---

## 👨‍💼 Admin Dashboard Features

### Navigation Menu
1. **نظرة عامة** - Overview/Dashboard
2. **إضافة لغة جديدة** - Add new language course
3. **الطلاب** - All students list with verification
4. **طلبات التسجيل** - All course signups (language, support, training)
5. **المدفوعات** - All payments with verification
6. **الرسوم السنوية** - Annual fee submissions
7. **إضافة دروس الدعم** - Add support lessons
8. **إضافة درس تكويني** - Add training course
9. **طلبيات الدورات التكوينية** - Training requests from students

### Key Admin Functions

#### Student Verification
- View all unverified students
- See profile photo and ID card
- Approve: Sets `verified: true`, `yearlyFeePaid: true`, creates payment record
- Reject: Sets `verified: false`

#### Payment Verification
- View all payment submissions
- Filter by status, type, branch
- See payment receipt images
- Approve: Updates status, grants access
- Reject: Updates status, denies access

#### Annual Fees Management
- Dedicated page for yearly fee submissions
- See student education details (level, school, subjects)
- Verify payment receipts
- Approve: Updates student `yearlyFeePaid: true`

#### Course Management
- Add/edit language courses with levels
- Add/edit support lessons
- Add/edit training courses
- Manage course availability

---

## 🔐 Access Control Logic

### For Language Courses
```javascript
if (!student.verified) {
  BLOCK: "الحساب غير موثق بعد"
}
// ✅ Can access
```

### For Support Lessons
```javascript
if (!student.verified) {
  BLOCK: "الحساب غير موثق بعد"
}
if (!student.yearlyFeePaid) {
  BLOCK: "الرسوم السنوية غير مدفوعة"
}
// ✅ Can access (but needs monthly payment verification)
```

### For Training Courses
```javascript
if (!student.verified) {
  BLOCK: "الحساب غير موثق بعد"
}
// ✅ Can access
```

---

## 📱 Student Dashboard Features

### Profile Section
- View profile photo
- View registration details
- Check verification status
- Check yearly fee payment status

### Enrolled Courses Section
- View all registered courses
- See payment status per course
- For support lessons: see monthly payment status
- Upload new payments

### Payment History
- View all payments
- Status: pending/approved/rejected
- View payment receipts
- Track monthly support lesson payments

### Quick Actions
- Pay yearly fee (if not paid)
- Upload payment for courses
- View notifications

---

## 🔄 Data Synchronization

### Student Record Updates
When admin approves verification:
1. `branches/{branchId}/students/{studentId}` → `verified: true`
2. `branches/{branchId}/users/{userId}` → Updates via AuthContext
3. Creates payment record in `branches/{branchId}/payments/`

When admin approves annual fee:
1. `branches/{branchId}/annualFees/{feeId}` → `status: "approved"`
2. `branches/{branchId}/students/{studentId}` → `yearlyFeePaid: true`
3. `branches/{branchId}/payments/` → Updates related payment

### Course Registration Updates
When admin approves signup:
1. `branches/{branchId}/signups/{signupId}` → `status: "approved"`
2. Student gets access notification
3. Course appears in student dashboard

---

## ⚠️ Important Notes

### Branch Separation
- All data is strictly separated by branch
- Each branch has its own admin
- Students can only access their branch data
- Cross-branch data is prevented

### Payment Flow
1. **Initial**: Status = "pending"
2. **Admin Reviews**: Checks screenshot
3. **Admin Decision**:
   - Approve → Status = "approved", access granted
   - Reject → Status = "rejected", access denied

### Monthly Support Lessons
- Requires initial yearly fee (1000 DZD) - one time
- Then monthly payments for lesson access
- Each month requires new payment verification
- Admin must approve each month's payment

### Security
- ID cards and photos required for verification
- Payment receipts required for all payments
- Admin must manually verify all submissions
- No automatic approvals

---

## 🛠️ Technical Implementation

### Key Components

**Frontend (React):**
- `RegisterPage.js` - Student registration
- `UnifiedRegistrationForm.js` - Course registration
- `YearlyFeeForm.js` - Annual fee payment
- `TrainingRequestForm.js` - Training requests
- `StudentDashboard.js` - Student portal
- `VerificationPanel.js` - Admin verification
- `AnnualFees.js` - Admin annual fees management
- `Payments.js` - Admin payment verification
- `SignUps.js` - Admin course registrations

**Backend (Firebase):**
- Firestore for data storage (branch-scoped)
- Firebase Auth for authentication
- Firebase Storage for images (receipts, IDs, photos)
- Security rules enforce branch separation

### API Endpoints
- All operations use Firebase SDK
- Real-time listeners for live updates
- Batch operations for multi-document updates

---

## 📋 Testing Checklist

### Student Flow
- [ ] Register with valid data
- [ ] Upload profile photo and ID
- [ ] See "not verified" status
- [ ] Cannot register for courses
- [ ] Wait for admin verification
- [ ] After verification: can register for languages/trainings
- [ ] Cannot register for support lessons without yearly fee
- [ ] Pay yearly fee
- [ ] After admin approval: can register for support lessons
- [ ] Upload monthly payments for support lessons

### Admin Flow
- [ ] View all unverified students
- [ ] See photos and ID cards clearly
- [ ] Approve student verification
- [ ] See annual fee submissions
- [ ] Approve annual fee payment
- [ ] View course registrations
- [ ] Verify payment screenshots
- [ ] Approve/reject course registrations
- [ ] View training requests
- [ ] Approve/reject training requests

### Data Integrity
- [ ] All data saved to correct branch
- [ ] No cross-branch data leakage
- [ ] Student status updates correctly
- [ ] Payment status syncs properly
- [ ] Course access granted after approval

---

## 🎉 Success Criteria

✅ All forms work correctly
✅ All student data connects between website and admin
✅ Admins can verify ID cards
✅ Admins can verify payments
✅ Admins can verify enrollments per branch
✅ Branch separation is maintained
✅ Students can only access courses after verification
✅ Support lessons require yearly fee
✅ Monthly payments work for support lessons
✅ Training requests are handled properly

---

## 🔧 Maintenance

### Adding New Course Types
1. Create collection under `branches/{branchId}/`
2. Add form component for registration
3. Update UnifiedRegistrationForm to handle new type
4. Add admin page for management
5. Update access control logic

### Adding New Payment Methods
1. Update payment method options in forms
2. Add account details in payment info display
3. Update admin verification process

### Modifying Verification Rules
1. Update logic in UnifiedRegistrationForm
2. Update access checks in course pages
3. Update admin approval actions

---

**System Version:** 1.0
**Last Updated:** 2025-10-28
**Status:** ✅ Complete and Functional






