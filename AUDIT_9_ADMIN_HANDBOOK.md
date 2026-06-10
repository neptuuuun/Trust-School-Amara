# AUDIT DOCUMENT 9 — ADMIN OPERATIONS HANDBOOK

**For: Branch Administrators**  
**Purpose: Day-to-day operations guide**

---

## Logging In

1. Navigate to `/admin/login`
2. Enter your admin email and password
3. You are automatically taken to your branch dashboard
4. **Important:** You can only see and manage students from your own branch

If you see "Access denied" or are redirected to the student login, your admin account may not be set up correctly. Contact the system owner.

---

## Dashboard Overview

When you log in, you see the admin dashboard with navigation to:
- **Overview** — statistics and summary
- **Students (المستخدمون)** — all students in your branch
- **Payments (المدفوعات)** — pending payment verifications
- **Annual Fees (الرسوم السنوية)** — annual fee management
- **Languages (اللغات)** — language course catalog and registrations
- **Trainings (التكوينات)** — training catalog and registrations
- **Support Lessons - Middle (دروس الدعم - متوسط)** — middle school lessons
- **Support Lessons - High (دروس الدعم - ثانوي)** — high school lessons
- **Announcements (الإعلانات)** — branch announcements
- **Admin Guide (الدليل)** — built-in help

---

## Student Management

### Viewing Students

Go to **Students** page. You can:
- Search by name or email
- Filter by status (pending, verified, rejected, all)
- See each student's details, documents, and payment history

### Approving a Student Account

1. Go to **Students** → filter by "Pending"
2. Click on the student to view their profile
3. Review their uploaded photo and ID card
4. Click **Approve (موافقة)** to activate the account
   - Student status changes from `pending` → `verified`
   - Student can now access all services

### Rejecting a Student Account

1. Go to **Students** → find the student
2. Click **Reject (رفض)**
3. Student is notified and must re-submit documents via their dashboard

### Creating a Student Account (Admin Enrollment)

Use this when enrolling a student directly without self-registration:

1. Go to **Students** → click **Create Student**
2. Fill in the student's information:
   - Full name
   - Email
   - Temporary password
   - Branch (your branch is pre-selected)
   - Study year / school level
3. Click **Create**
4. The student is created as immediately **verified** — no approval needed
5. Give the student their email and temporary password to log in
6. The student should change their password on first login

### Editing a Student

1. Click on a student
2. Edit their fields (name, phone, study year, etc.)
3. Save changes

**Note:** You cannot change a student's email (this requires Firebase Console access).

---

## Payment Verification

### Verifying an Annual Fee Payment

The annual fee unlocks support lesson access for the student.

1. Go to **Payments** page
2. You will see all pending payments
3. Click on a payment to view details
4. Click **View Receipt** to see the uploaded payment proof image
5. Verify the receipt is legitimate and matches the expected amount (1000 DZD)
6. Click **Verify (تحقق)**

What happens automatically when you verify:
- Payment status → Verified
- Student's `yearlyFeePaid` flag → true
- Support lesson subscription record created
- Student notified (if notifications configured)

### Rejecting an Annual Fee Payment

If the receipt is fake, wrong, or unreadable:

1. Click **Reject (رفض)**
2. The receipt file is deleted from storage
3. Student must submit a new payment

### Requesting a Payment Correction

If the receipt is blurry or incomplete but looks legitimate:

1. Click **Request Correction (طلب تصحيح)**
2. Enter the reason (e.g., "الصورة غير واضحة")
3. The payment status changes to `needs_correction`
4. The student sees a correction banner on their dashboard and can re-upload

---

## Annual Fees

Go to **Annual Fees** to view:
- All annual fee payments by year
- Which students have paid and which haven't
- Fee verification history

The academic year runs from September 1 to August 31.

---

## Language Management

### Managing the Language Catalog

Go to **Languages** → catalog view:

1. Click **Add Language** to add a new language offering
2. Fill in: name, levels, prices, capacity per level
3. Click **Save**

To edit or delete an existing language, click on it and use the edit/delete buttons.

### Approving Language Registrations

1. Go to **Languages** → **Registered (المسجلون)**
2. You see all pending language registration forms from students
3. Click on a registration to view details:
   - Student information
   - Selected language and level
   - Payment receipt
4. **Check capacity first** — the system will warn if the class is full
5. Click **Approve (قبول)**:
   - Student enrolled in the class
   - Enrollment count incremented
   - Receipt deleted from storage
   - Archive record created
6. Click **Reject (رفض)**:
   - Student notified
   - Receipt deleted

**Capacity Warning:** If a class is full, the system will prevent approval.

---

## Training Management

### Managing the Training Catalog

Go to **Trainings** → same process as languages:
- Add, edit, or delete training course offerings
- Set title, description, price, duration, capacity

### Approving Training Registrations

1. Go to **Trainings** → **Registered**
2. Review each pending training registration
3. View the student's payment receipt
4. Approve or reject

### Training Interest Requests

Students can also submit "interest" forms without full payment (Training Requests). Go to **Training Requests** to:
- See what trainings students are interested in
- Mark requests as reviewed
- Use this data to plan future course offerings

---

## Support Lessons Management

Support lessons are divided by school level:
- **Middle School (متوسط)** — grades 1-4 middle school
- **High School (ثانوي)** — grades 1-3 high school

### Managing Support Lesson Classes

1. Go to the appropriate support lessons page
2. Use **Subject/Class Manager** to:
   - Create subjects (e.g., "Mathematics")
   - Create classes under each subject (e.g., "Math — Year 3 — Group A")
   - Set capacity for each class
   - Assign a teacher

### Adding a Student to a Support Class

1. Go to **Support Registered (المسجلون في الدعم)**
2. View active registrations
3. Use **Add Student** button to manually add a student to a class
4. Or click **Edit** on an existing registration to change details

### Monitoring Enrollment

Each class shows:
- Current enrollment count
- Maximum capacity
- Enrolled students list

---

## Teachers

Go to **Teachers** (within the support lessons section) to:
1. Add a new teacher: name, subject specialty
2. Edit or remove teachers
3. Teachers are shown to students on the lesson listing

---

## Announcements

### Creating an Announcement

1. Go to **Announcements**
2. Click **Create New**
3. Fill in:
   - **Title** — announcement headline
   - **Content** — full message
   - **Category** — languages / trainings / support / events / general
   - **Style** — info (blue) / warning (yellow) / success (green) / urgent (red)
   - **Status** — Draft (not visible) or Published (visible)
   - **Target Page** — which page to show it on
   - **Expires At** — when to stop showing (optional)
4. Click **Publish**

Announcements are visible only to students in your branch.

### Editing or Deleting an Announcement

Click on any announcement and use the Edit or Delete buttons.

---

## Reports and Exports

### CSV Export

On the Students page:
1. Filter the students you want to export
2. Click **Export CSV**
3. A CSV file downloads with student data

This can be opened in Excel or Google Sheets.

### Printing a Student Record

1. Open a student's profile
2. Click **Print**
3. A formatted print view opens

---

## Troubleshooting

### Student says they cannot log in after approval

**Check:**
- Is their email verified? (They must click the link in their email first)
- Is their `verificationStatus` showing `verified` in the system?
- Are they logging in on the correct branch?

### Payment shows as pending but student says they paid weeks ago

**Check:**
- Did the student actually upload a receipt? (Look for receipt photo in the payment details)
- Is the backend server running? (Contact technical support if not)

### Class enrollment count seems wrong

**Check:**
- The count is managed by the system automatically
- If it seems off, contact technical support — manual correction requires database access

### Announcement not showing to students

**Check:**
- Status must be "Published" (not Draft)
- Check if the expiry date has already passed
- Verify the target page is correct

### Cannot see some students

**This is by design.** You only see students registered in your branch. Students in the other branch are not visible to you.

---

## Common Mistakes to Avoid

1. **Do not approve a payment without viewing the receipt image** — always click "View Receipt" first
2. **Do not create the same language class twice** — check the catalog before adding
3. **Do not reject a student without reviewing their documents** — look at the photo and ID card
4. **Do not forget to set class capacity** — if left at 0, capacity checks may not work correctly
5. **Do not post announcements meant for the other branch** — they are automatically branch-scoped, but double-check content

---

## Best Practices

1. **Check for pending verifications daily** — students are waiting for your approval
2. **Keep the language and training catalog up to date** — remove inactive courses
3. **Set realistic class capacities** — don't set capacity higher than the room allows
4. **Use Draft announcements** — write announcements in draft first, review, then publish
5. **Export student lists monthly** — keep a backup of your student data
6. **Request correction instead of rejecting** — if a receipt is only slightly unclear, request a correction rather than outright rejecting (better student experience)
