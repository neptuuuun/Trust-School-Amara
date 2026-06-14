# AUDIT DOCUMENT 8 — OWNER HANDBOOK

**Written in simple, non-technical language for the school owner.**

---

## What Is This Website?

This is your school's management system. It works like a digital office that handles:
- Student registrations
- Fee payments
- Course enrollments
- Student records
- Branch communications

The system manages two branches:
- **Boumerdes (بومرداس)**
- **Bordj Menaiel (برج منايل)**

Each branch works completely independently. The Boumerdes admin cannot see Bordj Menaiel students, and vice versa.

---

## Who Uses the Website?

### Students
Students use the website to:
- Create an account and register
- Pay their fees
- Enroll in courses (languages, support lessons, training)
- Track their registration status
- See school announcements

### Branch Admins
Each branch has one admin who uses the website to:
- Review and approve student accounts
- Verify payment receipts
- Manage course offerings
- Enroll students in classes
- Post announcements

### You (The Owner)
You manage the system through the Firebase Console (the backend database interface). You can:
- Add or remove admins
- See overall data across all branches
- Make technical configuration changes

---

## How Students Use the Website — Step by Step

### Step 1: Choose a Branch
When a student visits the website for the first time, they choose which branch they belong to (Boumerdes or Bordj Menaiel).

### Step 2: Create an Account
Students can create an account two ways:
1. **Email and Password** — Fill in a form with their name, birth date, phone number, and other information
2. **Google Sign-In** — Use their existing Google/Gmail account

They must also read and accept the school's internal rules.

### Step 3: Verify Email
After registering, students receive an email with a verification link. They must click the link before they can access their account. This confirms their email is real.

### Step 4: Upload Documents
Students upload:
- A personal photo
- A photo of their national ID card

These are reviewed by the branch admin.

### Step 5: Wait for Approval
The admin reviews the student's information and documents, then approves or rejects the account. Students see a "under review" message while waiting.

### Step 6: Account Activated
Once approved, the student has full access. They can:
- Register for language courses
- Register for training courses
- Pay the annual fee to access support lessons

### Step 7: Pay Annual Fee
To access support lessons, students must pay a yearly fee (1000 DZD). They:
1. Navigate to the support lessons page
2. Select a lesson
3. Upload a photo of their payment receipt
4. Wait for admin verification

### Step 8: Enroll in Courses
Students can register for:
- **Language courses** (Arabic, French, English, etc.) — one payment, permanent access
- **Training courses** — one payment, permanent access
- **Support lessons** — monthly subscription, must renew each month

---

## Workflow 

### Admin Side
1. Admin logs in and checks the dashboard
2. Reviews new student registrations → approves or rejects
3. Reviews uploaded payment receipts → verifies or requests correction

### Student Side
4. Students see approval notificatio
5. Students who are approved can enroll in courses
6. Students upload payment proofs for courses they want to join

### Admin Side
7. Admin approves course enrollments
8. Admin sends announcements if needed
9. Admin checks class capacity (is any class too full?)

---

## The Payment Process (Simple View)

```
Student submits payment proof
         ↓
Admin reviews the receipt photo
         ↓
    [If receipt is clear]           [If receipt is blurry/wrong]
         ↓                                    ↓
   Admin approves                  Admin requests correction
         ↓                                    ↓
Student gets access              Student uploads a new receipt
                                            ↓
                                    Admin reviews again
```

---

## Types of Courses

### 1. Language Courses
- One-time payment
- Permanent access once approved
- Examples: Arabic, French, English, Spanish

### 2. Training Courses
- One-time payment
- Permanent access once approved
- Examples: Computer skills, professional certificates

### 3. Support Lessons (دروس الدعم)
- Monthly subscription
- Students must pay the **annual fee first** (1000 DZD/year)
- Then pay each month for their chosen subject
- Available for middle school and high school students
- Must renew every month or access expires

---

## Announcements

Admins can post announcements to students in their branch. Announcements can be:
- **Informational** (blue) — General information
- **Warning** (yellow) — Important notices
- **Success** (green) — Good news
- **Urgent** (red) — Critical notices

Announcements can be targeted to specific pages of the website.

---

## What the Website Cannot Do (Limitations)

1. **No automatic payment processing** — Students upload proof photos; admins verify manually
2. **No automatic enrollment** — Admin must approve every registration
3. **No attendance tracking** — Attendance must be tracked separately
4. **No parent portal** — Parents access through the student's account
5. **No mobile app** — Web browser only (works on phones but no dedicated app)

---

## Important Numbers to Know

| Item | Value |
|---|---|
| Annual fee | 1,000 DZD |
| Branches | 2 (Boumerdes, Bordj Menaiel) |


---

## When Something Goes Wrong

### Student cannot log in
→ Check if their email is verified (they need to click the verification link in their email)
→ Check if the admin has approved their account
→ Check if they are logging in on the correct branch

### Student says their payment was approved but they still cannot access courses
→ The admin should verify the payment in the Payment Verification page
→ Check if there is a technical issue with the backend server

### Admin cannot see student payments
→ Check if the student submitted to the correct branch
→ Check if the backend server is running

### Announcement not showing to students
→ Check if it is set to "Published" (not Draft)
→ Check if the expiry date has passed

---

## Security Overview (What Protects Your Data)

- Each student can only see their own data
- Each admin can only see their own branch's data
- Admin accounts are set up manually by the owner (cannot be self-registered)
- Payments can only be approved by admins (students cannot approve their own payments)
- All file uploads are stored securely (Supabase cloud storage)
- The website uses Google's Firebase for security and authentication
