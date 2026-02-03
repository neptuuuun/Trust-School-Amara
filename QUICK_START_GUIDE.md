# 🚀 Quick Start Guide - School Website

## ⚡ Get Started in 5 Minutes

This guide will help you quickly understand and start using the school website system.

---

## 🎯 Quick Overview

**What This System Does:**
- Students register with ID cards and photos
- Admins verify student identities
- Students pay fees and register for courses
- Admins approve payments and grant access
- Everything is separated by branch

---

## 👥 For Students

### 1️⃣ Register (First Time)
```
1. Go to: /register
2. Select your branch
3. Fill in your information:
   - Full name, email, password
   - Birth date, birth place, address
   - Phone number
4. Upload your photo (profile picture)
5. Upload your ID card photo
6. Click "إنشاء الحساب" (Create Account)
```

**What happens next:** Admin will review your ID and photos. You'll get verified within 24-48 hours.

### 2️⃣ After Verification

**For Language/Training Courses:**
```
1. Browse available courses
2. Click "Register" on course you want
3. Fill registration form
4. Choose payment method (CCP or BaridiMob)
5. Make payment
6. Send screenshot to WhatsApp: +213797706549
7. Submit registration
```

**For Support Lessons (Yearly Fee Required):**
```
First Time Setup:
1. Go to annual fees page
2. Fill education details (level, school, subjects)
3. Pay 1000 DZD
4. Upload payment receipt
5. Submit
6. Wait for admin approval

Every Month After:
1. Register for support lesson
2. Upload monthly payment proof
3. Admin approves
4. Get access for that month
```

### 3️⃣ Track Your Status

**Student Dashboard shows:**
- ✅ Verification status
- 💰 Payment history
- 📚 Registered courses
- 📊 Quick stats

---

## 👨‍💼 For Admins

### Login
```
URL: /admin
Email: Your admin email (configured in system)
Password: Your admin password
```

### Daily Tasks

#### ✅ Verify New Students
```
1. Go to: الطلاب (Students)
2. See students with yellow borders (not verified)
3. Click on ID card to view full size
4. Check profile photo
5. Click "موافقة" (Approve) if valid
   OR "رفض" (Reject) if invalid
```

**What this does:**
- Sets student as verified ✅
- Sets yearly fee as paid ✅
- Creates payment record 💰
- Student can now register for courses 🎓

#### 💰 Approve Payments
```
1. Go to: المدفوعات (Payments)
2. See all payment submissions
3. Click "عرض" (View) to see receipt
4. Verify payment is legitimate
5. Click "موافقة" (Approve)
```

**What this does:**
- Grants student access to course ✅
- Updates payment status ✅
- Updates signup status ✅

#### 📋 Review Annual Fees
```
1. Go to: الرسوم السنوية (Annual Fees)
2. See student education details:
   - Level, school, subjects
   - Payment receipt
3. Click "عرض" (View) for full details
4. Click "موافقة" (Approve) if valid
```

**What this does:**
- Sets yearlyFeePaid = true ✅
- Student can now register for support lessons ✅

#### 📝 Manage Course Registrations
```
1. Go to: طلبات التسجيل (Sign-Ups)
2. See all course registrations
3. Filter by type (language/support/training)
4. Click "موافقة" (Approve) or "رفض" (Reject)
```

#### ➕ Add New Courses
```
Languages:
- Go to: إضافة لغة جديدة
- Enter language name
- Fill details for each level (A1-C2)
- Submit

Support Lessons:
- Go to: إضافة دروس الدعم
- Enter subject, teacher, level, schedule, price
- Submit

Training Courses:
- Go to: إضافة درس تكويني
- Enter title, teacher, schedule, price, description
- Submit
```

---

## 📊 Understanding Status Colors

### Student Verification
- 🟡 **Yellow Border** = Not verified yet (needs your review)
- 🟢 **Green Border** = Verified (approved)

### Payments
- 🟡 **Yellow Badge** = Pending (needs your review)
- 🟢 **Green Badge** = Approved (payment verified)
- 🔴 **Red Badge** = Rejected (payment declined)

### Yearly Fee
- ✅ **"✓ مدفوعة"** = Paid (student can register for support lessons)
- ✗ **"✗ غير مدفوعة"** = Not paid (student cannot register for support lessons)

---

## 🔄 Common Workflows

### New Student Registration → Course Access
```
1. Student registers → Creates account
2. Admin verifies → Approves student
3. Student registers for course → Submits payment
4. Admin approves payment → Grants access
5. Student can access course ✅
```

### Support Lessons Access
```
1. Student registers → Creates account
2. Admin verifies → Approves student
3. Student pays yearly fee (1000 DZD) → Submits
4. Admin approves yearly fee → Sets yearlyFeePaid=true
5. Student registers for support lesson → Uploads monthly payment
6. Admin approves monthly payment → Grants monthly access
7. Next month → Student uploads new payment → Repeat
```

### Training Request (No Course Available)
```
1. Student fills training request form → Specifies what they want
2. Saves to training requests → Admin gets notified
3. Admin reviews request → Decides to create training or reject
4. If accepted → Admin creates new training course
5. Student registers for new training → Normal payment flow
```

---

## 🎓 Branch Management

### Why Branches Matter
- Each branch has separate students
- Each branch has separate courses
- Each branch has separate payments
- Data never mixes between branches

### How to Switch Branches (Admin)
```
1. Look at top bar in admin dashboard
2. See dropdown: "الفرع" (Branch)
3. Select branch from dropdown
4. All data updates to show only that branch
```

### Important Notes
- Always select branch first before working
- Students can only see their branch
- Admins can manage all branches
- Data is 100% separated

---

## ⚠️ Important Rules

### For Students
1. ✅ Must be verified before registering for courses
2. ✅ Must pay yearly fee (1000 DZD) before support lessons
3. ✅ Must upload payment proof for all courses
4. ✅ Must send payment screenshot to WhatsApp
5. ✅ Must wait for admin approval

### For Admins
1. ✅ Always select correct branch first
2. ✅ Verify ID cards carefully before approving
3. ✅ Check payment receipts match student info
4. ✅ Approve/reject within 24-48 hours
5. ✅ Add courses regularly to keep students engaged

---

## 🆘 Troubleshooting

### Student Can't Register for Courses
**Check:**
- Is student verified? (Check in admin → students)
- For support lessons: Is yearly fee paid?
- Did admin approve their verification?

### Payment Not Showing
**Check:**
- Did student select correct branch?
- Did student submit the form completely?
- Check "المدفوعات" (Payments) page
- Look for pending payments

### Course Not Appearing
**Check:**
- Is course active? (Check admin course management)
- Is student in correct branch?
- Did admin create course for this branch?

### ID Card Not Visible
**Check:**
- Did student upload image?
- Is image format JPG or PNG?
- Is file size under 5MB?
- Try clicking on placeholder to see if image loads

---

## 📱 Mobile Access

### Students
- Fully responsive on mobile
- Can upload photos from phone camera
- Easy payment submission
- Mobile-friendly dashboard

### Admins
- Mobile-responsive admin panel
- Can verify on mobile
- Can view photos/receipts on phone
- All features work on mobile

---

## 💡 Pro Tips

### For Admins
- **Morning Routine:** Check pending verifications and payments
- **Set Notifications:** Check system 2-3 times per day
- **Batch Process:** Verify multiple students at once
- **Quick Approve:** Use keyboard shortcuts for faster work
- **Regular Updates:** Add new courses based on student requests

### For Students
- **Good Photos:** Use clear, high-quality images for ID
- **Payment Proof:** Always keep original receipts
- **WhatsApp First:** Send payment screenshot before form submission
- **Check Email:** Watch for verification notifications
- **Dashboard Daily:** Check dashboard for updates

---

## 📞 Payment Methods

### CCP (بريد الجزائر)
```
Account Number: 0040385470
Key: 94
Name: [School Name]
```

### BaridiMob
```
Phone Number: 00799999004038547094
```

### After Payment
```
1. Take screenshot of payment confirmation
2. Send to WhatsApp: +213797706549
3. Include your email in message
4. Then submit form with same screenshot
```

---

## 📅 Typical Timeline

### New Student Journey
```
Day 1: Student registers → Uploads ID
Day 2: Admin verifies → Approves student
Day 2: Student can register for courses
Day 2: Student submits payment
Day 3: Admin approves payment
Day 3: Student gets course access ✅
```

### Support Lessons Journey
```
Day 1: Student registers → Verified
Day 2: Student pays yearly fee (1000 DZD)
Day 3: Admin approves yearly fee
Day 3: Student can register for support lessons
Then: Monthly payment → Monthly access
```

---

## ✅ Checklist for Admins

### Daily Tasks
- [ ] Check new student registrations
- [ ] Verify pending ID cards
- [ ] Approve verified payments
- [ ] Review course sign-ups
- [ ] Check training requests

### Weekly Tasks
- [ ] Review annual fee submissions
- [ ] Add new courses if requested
- [ ] Update course schedules
- [ ] Check student feedback
- [ ] Generate reports (if needed)

### Monthly Tasks
- [ ] Verify all support lesson monthly payments
- [ ] Review branch performance
- [ ] Update pricing if needed
- [ ] Archive old records
- [ ] Plan next month's courses

---

## 🎉 Success Metrics

**You're doing well if:**
- ✅ Students get verified within 24 hours
- ✅ Payments approved within 48 hours
- ✅ No pending verifications older than 2 days
- ✅ Students report easy payment process
- ✅ Course selection is diverse and updated

---

## 📚 Need More Help?

**Detailed Documentation:**
- `SYSTEM_FLOW_GUIDE.md` - Complete system explanation
- `IMPLEMENTATION_SUMMARY.md` - All technical details

**Technical Support:**
- Check Firebase Console for data issues
- Review browser console for errors
- Contact development team for bugs

**Business Support:**
- Review admin dashboard regularly
- Monitor student feedback
- Adjust courses based on demand

---

**Last Updated:** October 28, 2025
**System Version:** 1.0
**Status:** ✅ Ready for Production

---

## 🚀 Ready to Start?

### As Admin:
1. Login at `/admin`
2. Select your branch
3. Start verifying students!

### As Student:
1. Register at `/register`
2. Upload your ID and photo
3. Wait for verification
4. Start learning!

**That's it! You're ready to go! 🎓**






