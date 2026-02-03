# 🗺️ Routes Reference Guide

## Student Routes

### Registration & Authentication
- `/register` - Student registration (creates user with `verified: false`)
- `/login` - Student login (blocked until `verified: true`)
- `/profile` - Student dashboard (shows verification status)

### Course Registration Forms
- `/language-registration` - Register for language courses
- `/support-lesson-registration` - Register for support lessons (monthly)
- `/yearly-fee` - Pay yearly fee for support lessons (1000 DZD)
- `/training-registration` - Register for trainings or request new courses

### Information Pages
- `/home` - Homepage
- `/languages` - Browse language courses
- `/support-lessons` - Browse support lessons
- `/trainings` - Browse training courses
- `/contact` - Contact page

---

## Admin Routes

### Verification & Approval
- `/admin/users-verification` - ✅ Verify new user registrations
- `/admin/payments-verification` - ✅ Verify all types of payments (unified)
- `/admin/annual-fees` - View and approve yearly fee payments

### Course Management
- `/admin/add-language` - ✅ Add new language course
- `/admin/add-support-lesson` - ✅ Add new support lesson
- `/admin/add-training` - ✅ Add new training course
- `/admin/training-requests` - ✅ Review student training requests

### Legacy Management Pages
- `/admin` - Overview dashboard
- `/admin/languages` - Manage all language courses
- `/admin/students` - View all students
- `/admin/signups` - View all sign-ups
- `/admin/payments` - Old payments page
- `/admin/support-lessons` - Old support lessons management
- `/admin/trainings` - Old trainings management

---

## How to Use Routes

### For Students

#### 1. Registration Flow
```
/register → Create account (verified: false)
/login → Blocked with message
(Wait for admin approval)
/login → Success!
```

#### 2. Language Course Registration
```
/languages → Browse courses
/language-registration → Register and pay
(Wait for admin approval)
```

#### 3. Support Lesson Registration
```
/yearly-fee → Pay 1000 DZD yearly fee
(Wait for admin approval)
/support-lesson-registration → Register for monthly lesson
(Wait for admin approval)
```

#### 4. Training Registration
```
/trainings → Browse trainings
/training-registration → Register or request new course
(Wait for admin approval)
```

### For Admins

#### Daily Workflow
```
1. /admin/users-verification → Approve new students
2. /admin/payments-verification → Approve all payments
3. /admin/training-requests → Review training requests
4. /admin/add-* → Add new courses as needed
```

---

## Direct Links for Navigation

### Add to Header/Menu for Students
```jsx
<Link to="/language-registration">دورات اللغة</Link>
<Link to="/support-lesson-registration">دروس الدعم</Link>
<Link to="/yearly-fee">الرسوم السنوية</Link>
<Link to="/training-registration">الدورات التكوينية</Link>
```

### Add to Student Dashboard
```jsx
{!verified && <p>حسابك قيد المراجعة</p>}
{verified && !yearlyFeePaid && (
  <Link to="/yearly-fee">ادفع الرسوم السنوية</Link>
)}
{verified && (
  <>
    <Link to="/language-registration">سجل في دورة لغة</Link>
    <Link to="/training-registration">سجل في دورة تكوينية</Link>
  </>
)}
{verified && yearlyFeePaid && (
  <Link to="/support-lesson-registration">سجل في درس دعم</Link>
)}
```

---

## URL Structure

### Pattern
```
Student Forms: /{feature}-registration or /{feature}-{action}
Admin Pages: /admin/{feature} or /admin/{feature}-{action}
```

### Examples
```
Good:
✅ /language-registration
✅ /yearly-fee
✅ /admin/users-verification
✅ /admin/add-language

Avoid:
❌ /register-language (inconsistent)
❌ /admin-users-verification (missing /)
❌ /languageRegistration (camelCase)
```

---

## Protected Routes

### RequireStudent (Must be logged in as student)
- `/profile`
- `/student-dashboard`

### RequireAdmin (Must be logged in as admin)
- `/admin/*` (all admin routes)

### BranchGuard (Must have selected branch)
- All routes except:
  - `/select-branch`
  - `/branch-selector`

---

## Testing Routes

### Manual Testing
```bash
# Test student flow
1. Go to /register
2. Try /login (should fail)
3. Admin approves at /admin/users-verification
4. Go to /login (should work)
5. Go to /profile (should show verified)

# Test admin flow
1. Go to /admin (redirects to /admin/login if not logged in)
2. Login as admin
3. Go to /admin/users-verification
4. Approve users
5. Go to /admin/payments-verification
6. Approve payments
```

### Automated Testing (Future)
```javascript
describe('Student Routes', () => {
  it('should block unverified student login', () => {
    // Test logic
  });
  
  it('should show verification status on dashboard', () => {
    // Test logic
  });
});
```

---

## Quick Commands for Development

```bash
# Start dev server
npm start

# Access routes
# Student: http://localhost:3000/language-registration
# Admin: http://localhost:3000/admin/users-verification

# Test on mobile
# Use: http://<your-ip>:3000/...
```

---

## 🎯 Most Important Routes

### Students Need:
1. `/register` - Sign up
2. `/login` - Log in
3. `/yearly-fee` - Pay for support lessons access
4. `/language-registration` - Register for languages
5. `/training-registration` - Register for trainings

### Admins Need:
1. `/admin/users-verification` - Approve new students (MOST IMPORTANT)
2. `/admin/payments-verification` - Approve all payments (MOST IMPORTANT)
3. `/admin/add-language` - Add courses
4. `/admin/add-support-lesson` - Add courses
5. `/admin/add-training` - Add courses

---

**All routes are now live and functional!** ✅







