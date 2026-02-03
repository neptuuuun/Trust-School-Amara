# Firebase Integration Fixes - Deployment Guide

## 🎯 Issues Fixed

### 1. **Firestore Security Rules Mismatch** ✅
- **Problem**: Rules were written for flat structure (`/users/{userId}`) but app uses branch-based paths (`branches/{branchId}/users/{uid}`)
- **Fix**: Completely rewrote `firestore.rules` to match the branch-based architecture
- **Impact**: Admin can now see all data from the selected branch; students can access their own data

### 2. **Environment Variable Prefix** ✅
- **Problem**: Using `NEXT_PUBLIC_` (Next.js) instead of `REACT_APP_` (Create React App)
- **Fix**: Updated `src/firebase.js` to use correct prefix
- **Impact**: Environment variables will now be properly loaded if you create a `.env` file

### 3. **Admin Email Consistency** ✅
- **Problem**: Admin emails not synchronized across files
- **Fix**: Synchronized admin emails in:
  - `firestore.rules`
  - `src/contexts/AuthContext.js`
  - `src/admin/AdminLogin.js`
- **Current Admin Emails**:
  - `marouabenzaoui48@gmail.com`
  - `trustschoolamara@gmail.com`
  - `admin@trust-school.com`

### 4. **Collection Path Standardization** ✅
- **Problem**: Mixed use of `requests` and `training_requests` collections
- **Fix**: Standardized all training requests to use `training_requests`
- **Files Updated**:
  - `src/admin/pages/TrainingRequests.js`
  - `src/admin/pages/Students.js`
  - `src/pages/TrainingsPage.js`

---

## 🚀 Deployment Steps

### Step 1: Deploy Firestore Rules

```bash
# Make sure you're in the project root
cd "C:\Users\PC\Desktop\Projects\New folder (5)\school-website-react"

# Deploy the new Firestore rules
firebase deploy --only firestore:rules
```

**Expected Output:**
```
✔  Deploy complete!
```

### Step 2: Verify Rules in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your `trust-school` project
3. Navigate to **Firestore Database** → **Rules**
4. Verify the rules show the new branch-based structure

### Step 3: Test Admin Login

1. Navigate to `/admin/login` or `/admin`
2. Login with: `marouabenzaoui48@gmail.com`
3. You should be redirected to `/admin` (admin dashboard)
4. Select a branch from the dropdown
5. Verify you can see:
   - Signups
   - Students
   - Payments
   - Training requests
   - Languages
   - Support courses
   - Trainings

### Step 4: Test Student Login

1. Navigate to `/login`
2. Select a branch first if not already selected
3. Login with a student account
4. Verify student can:
   - View their dashboard
   - See their courses
   - See their payments
   - Register for courses

---

## 🔧 Testing Checklist

### Admin Dashboard Tests

- [ ] **Login**: Admin can login at `/admin/login`
- [ ] **Branch Selection**: Can select different branches from dropdown
- [ ] **View Signups**: Can see all signups for selected branch
- [ ] **View Students**: Can see all students for selected branch
- [ ] **View Payments**: Can see all payments for selected branch
- [ ] **View Training Requests**: Can see all training requests
- [ ] **View Languages**: Can see and add languages
- [ ] **View Support Courses**: Can see and add support courses
- [ ] **View Trainings**: Can see and add trainings
- [ ] **Approve/Reject**: Can approve/reject signups and requests

### Student Tests

- [ ] **Branch Selection**: Must select branch before login
- [ ] **Registration**: Can create account for a branch
- [ ] **Login**: Can login to their branch
- [ ] **View Dashboard**: Can see their profile and enrolled courses
- [ ] **Register for Course**: Can register for languages/support/training
- [ ] **Upload Payment**: Can upload payment proof
- [ ] **Cross-Branch**: Cannot access data from other branch

### Public Site Tests

- [ ] **View Courses**: Anyone can view available courses per branch
- [ ] **View Languages**: Anyone can view available languages per branch
- [ ] **View Trainings**: Anyone can view available trainings per branch
- [ ] **Submit Request**: Anyone can submit training requests

---

## 📋 Firestore Structure Reference

Your Firestore database should follow this structure:

```
firestore
├── branches (collection)
│   ├── {branchId} (document)
│   │   ├── name: "Branch A"
│   │   ├── priceOverrides: {...}
│   │   └── (subcollections)
│   │       ├── users
│   │       │   └── {userId}
│   │       │       ├── email
│   │       │       ├── role: "student" | "teacher"
│   │       │       ├── branchId
│   │       │       └── ...
│   │       ├── students
│   │       │   └── {studentId}
│   │       ├── signups
│   │       │   └── {signupId}
│   │       ├── payments
│   │       │   └── {paymentId}
│   │       ├── support_courses
│   │       │   └── {courseId}
│   │       ├── languages
│   │       │   └── {languageId}
│   │       ├── trainings
│   │       │   └── {trainingId}
│   │       ├── training_requests
│   │       │   └── {requestId}
│   │       ├── studentSubjects
│   │       │   └── {subjectId}
│   │       └── recent_activity
│   │           └── {activityId}
│   └── {branchId} (another branch...)
│       └── (same structure)
└── notifications (global collection)
    └── {notificationId}
```

---

## 🔐 Security Rules Summary

### Admin Access
- **Email-based**: Hardcoded admin emails in rules
- **Full Access**: Can read/write all branch data
- **No Profile Required**: Admin doesn't need a user document

### Student Access
- **Branch-Scoped**: Can only access data in their branch
- **Own Data**: Can read/write their own user document
- **Read Public**: Can read courses, languages, trainings
- **Create Signups**: Can create signup/payment requests

### Public Access
- **Read Branches**: Anyone can read branch documents
- **Read Courses**: Anyone can read public course data
- **Create Requests**: Anyone can submit training requests/signups

---

## ⚠️ Important Notes

### 1. Admin Emails
To add more admin users, update all three locations:
1. `firestore.rules` (lines 12-15)
2. `src/contexts/AuthContext.js` (lines 29-33)
3. `src/admin/AdminLogin.js` (lines 22-26)

### 2. Environment Variables
If you want to use environment variables instead of hardcoded config:

Create `.env` file in project root:
```env
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=trust-school.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=trust-school
REACT_APP_FIREBASE_STORAGE_BUCKET=trust-school.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=488208060844
REACT_APP_FIREBASE_APP_ID=1:488208060844:web:a6b2e9e65d154b3cddaa09
REACT_APP_FIREBASE_MEASUREMENT_ID=G-BKGJLY224G
```

**Note**: Restart the dev server after creating `.env` file.

### 3. Branch Initialization
Make sure you have branch documents in Firestore:

```javascript
// Example branch document at: /branches/branchA
{
  id: "branchA",
  name: "فرع أ",
  priceOverrides: {
    yearlyFee: 1000,
    supportLessons: { monthly: 2000 }
  },
  createdAt: timestamp
}
```

### 4. Storage Rules
If using Firebase Storage, also deploy storage rules:
```bash
firebase deploy --only storage
```

---

## 🐛 Troubleshooting

### Issue: "Permission Denied" errors in console

**Cause**: Old rules still active or rules deployment failed

**Solution**:
1. Check Firebase Console → Firestore → Rules
2. Verify rules were updated
3. Re-deploy: `firebase deploy --only firestore:rules`
4. Clear browser cache and local storage
5. Re-login

### Issue: Admin cannot see data after login

**Cause**: Branch not selected or email not in admin list

**Solution**:
1. Check console for auth logs
2. Verify email matches exactly in rules/code
3. Select a branch from dropdown
4. Check that branch has data in Firestore

### Issue: Student sees "branch mismatch" error

**Cause**: Student trying to access different branch than their registration

**Solution**:
1. Student must select correct branch before login
2. Each student is tied to one branch
3. To switch branches, create new account

### Issue: Data not showing in admin panel

**Cause**: No data in Firestore for that branch

**Solution**:
1. Go to Firebase Console → Firestore
2. Check path: `branches/{branchId}/...`
3. Ensure documents exist
4. Try creating test data via admin UI

---

## 📞 Support

If you encounter issues after deployment:

1. **Check Console**: Open browser DevTools → Console for errors
2. **Check Firebase Logs**: Firebase Console → Functions → Logs (if using Cloud Functions)
3. **Verify Rules**: Firestore Rules should show "Last deployed" timestamp
4. **Test Individual Paths**: Use Firestore Console to test rule simulation

---

## ✅ Success Criteria

You'll know everything is working when:

1. ✅ Admin can login and see dashboard
2. ✅ Admin can select branches and see different data
3. ✅ Admin can view/manage all collections per branch
4. ✅ Students can register and login per branch
5. ✅ Students can only see their own data
6. ✅ Public visitors can view courses without login
7. ✅ No "Permission Denied" errors in console
8. ✅ Data written from site appears in admin panel immediately

---

**Last Updated**: October 28, 2025  
**Firebase Project**: trust-school  
**Framework**: React (Create React App)







