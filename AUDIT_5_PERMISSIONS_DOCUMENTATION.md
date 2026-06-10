# AUDIT DOCUMENT 5 — ROLES & PERMISSIONS DOCUMENTATION

**All permissions are verified from `firestore.rules`, `backend/middleware/auth.js`, and `App.js` route guards.**

---

## Roles

| Role | Description | Where Stored |
|---|---|---|
| `student` | Registered learner (self-registered or admin-enrolled) | `branches/{branchId}/users/{uid}.role` |
| `admin` | Branch manager (provisioned manually) | `/admins/{uid}.role` |

There is no super-admin role in the frontend. The Firebase Console and Admin SDK are used for super-admin operations.

---

## Student Permissions

### What Students CAN View

| Resource | Condition |
|---|---|
| Their own profile | `isSelf(uid)` |
| Their own annual payments | `annualPayments[userId == uid]` |
| Their own language form entries | Path contains their UID: `languagesForms/{uid}/languageFormEntries/*` |
| Their own training form entries | `trainingsForms/{uid}/trainingFormEntries/*` |
| Their own approved language registrations | `languagesRegistered[userId == uid]` |
| Their own approved training registrations | `trainingsRegistered[userId == uid]` |
| Their own support lesson registrations | `supportLessonRegistrations[userId == uid]` (global) |
| Their own registrations (branch view) | `registrations[userId == uid]` |
| Their own payments | `payments[userId == uid]` |
| Their own annual fees | `annualFees[userId == uid]` |
| All branch announcements | Any authenticated user (`isAuthenticated()`) |
| Branch document (for branch selection) | Public (`true`) |
| Language catalog | Public (`true`) |
| Training catalog | Public (`true`) |
| Support lesson catalog | Public (`true`) |
| Subjects catalog | Public (`true`) |
| Classes catalog | Public (`true`) |
| Teachers catalog | Public (`true`) |
| Notifications targeting them or 'all' | `target == 'all' || target == uid` |

### What Students CAN Create

| Resource | Condition | Restrictions |
|---|---|---|
| Their own user profile | `isSafeUserCreate(uid)` | Role must be `'student'`, all privilege flags must be false, verificationStatus max `'pending'` |
| Their own annual payment | `userId == uid && status == 'pending'` | Can only create with `status='pending'`, no other status |
| Their own language form entry | `isSelf(userId) && noPrivilegedStatus()` | Cannot inject verified/paid/admin flags |
| Their own training form entry | `isSelf(userId) && noPrivilegedStatus()` | Cannot inject verified/paid/admin flags |
| Their own training request | `userId == uid && noPrivilegedStatus()` | Cannot inject privileged status |
| Branch-scoped registration | `userId == uid && noPrivilegedStatus()` | Cannot inject privileged status |
| Support lesson registration | ❌ BLOCKED — backend Admin SDK only | `allow create, update, delete: if false` |

### What Students CAN Update

| Resource | Condition | Restrictions |
|---|---|---|
| Their own profile | `isSelf(uid) && isSafeUserSelfUpdate()` | Cannot change: role, isAdmin, studyYear (if set), schoolLevel (if set), yearlyFeePaid, paymentVerified, accountVerified, verified, verificationStatus |
| Their own profile (registration completion) | `isSelf(uid) && isCompletingRegistration()` | One-way transition: completedProfile false→true, verificationStatus unverified→pending only |

### What Students CANNOT Do

- Write to `/admins/{uid}` (blocked: `allow write: if false`)
- Write to `/supportLessonRegistrations/{id}` (blocked: `allow create, update, delete: if false`)
- Set their own `role` to anything other than `'student'`
- Set their own `verificationStatus` to `'verified'` or `'approved'`
- Set their own `yearlyFeePaid`, `paymentVerified`, or `accountVerified` to `true`
- Approve their own language or training registrations
- Access another student's data
- Access admin routes (`/admin/*`)
- Access student routes before email verification
- Access student routes while `verificationStatus === 'pending'`

---

## Admin Permissions

### What Admins CAN View (within their branch)

| Resource |
|---|
| All students in their branch |
| All annual payments in their branch |
| All language form entries in their branch (collection-group) |
| All training form entries in their branch (collection-group) |
| All language registrations (approved archive) |
| All training registrations (approved archive) |
| All payments in their branch |
| All annual fees in their branch |
| All announcements (including drafts) |
| All support lesson registrations in their branch |
| All registrations (branch view) |
| All training requests |
| Branch metadata (`/branches/{branchId}/meta/*`) |
| Their own admin document (`/admins/{uid}`, self-read only) |

### What Admins CAN Create (within their branch)

- Students (via Admin SDK, bypasses all client rules)
- Language catalog entries
- Training catalog entries
- Support lesson catalog entries
- Classes and subjects
- Teachers
- Announcements
- Annual fee payments (on behalf of students)
- Approved language/training registration archives

### What Admins CAN Update (within their branch)

- Student profiles (full access)
- Annual payments (`status` — to verified/rejected/needs_correction)
- Language form entries (to approve/reject)
- Training form entries (to approve/reject)
- Language/training registrations (approved archive)
- Announcements
- Support lesson registrations (via Admin SDK)
- Classes (enrollment count via Admin SDK)
- Branch document

### What Admins CAN Delete (within their branch)

- Students
- Language/training catalog entries
- Announcements
- Payment records
- Language/training form entries

### What Admins CANNOT Do

- Access another branch's data
- Write to `/admins/{uid}` (this collection is write-blocked even for admins from the client)
- Directly modify `supportLessonRegistrations` from the client (Admin SDK only)
- Access admin routes for a different branch (enforced by `requireAdmin` middleware)

---

## Branch Isolation — How It Works

### Layer 1: Frontend (BranchGuard)

```javascript
// App.js
function BranchGuard() {
  if (!selectedBranchId && !isSelectingBranch && !isAdminRoute) {
    return <Navigate to="/select-branch" />;
  }
  // Branch mismatch for non-admin users
  if (user && role !== 'admin' && selectedBranchId && branch && branch !== selectedBranchId) {
    return <Navigate to="/login" />;
  }
}
```

A student whose Firestore profile is in `boumerdes` cannot access data while `selectedBranchId` is `bordj_menaiel`.

### Layer 2: Firestore Rules (isBranchAdmin)

```javascript
function isBranchAdmin(branchId) {
  return isAdmin() && getAdminBranchId() == branchId;
}
```

Admin reads/writes within `/branches/{branchId}/*` require that the admin's `branchId` in `/admins/{uid}` matches the path segment. An admin cannot query another branch's data.

### Layer 3: Backend Middleware (requireAdmin)

```javascript
// Resolves admin branch from /admins/{uid}
// Enforces: request.body.branchId === admin's branchId
```

All sensitive API operations (payment verification, student creation) validate that the `branchId` in the request matches the admin's assigned branch. Cross-branch operations fail with an authorization error.

### Branch Isolation Example

**Scenario:** Admin A manages Boumerdes. Admin B manages Bordj Menaiel. Student X is registered in Boumerdes.

| Operation | Admin A | Admin B |
|---|---|---|
| View Student X's profile | ✅ (same branch) | ❌ (Firestore rule blocks) |
| Approve Student X's payment | ✅ | ❌ (backend middleware blocks) |
| See Boumerdes announcements | ✅ | ❌ |
| Create a student in Boumerdes | ✅ | ❌ |

---

## Privilege Escalation Prevention

### `noPrivilegedStatus()` Rule Function

Applied to all student-initiated creates. Blocks:
- `verified = true`
- `accountVerified = true`
- `paymentVerified = true`
- `yearlyFeePaid = true`
- `feePaid = true`
- `isAdmin = true`
- `paymentStatus` set to anything other than `'pending'`
- `status` set to `verified`, `approved`, `paid`, `active`, or `registered`

### `isSafeUserSelfUpdate()` Rule Function

Applied to student self-updates. Blocks changing:
- `role` (must stay `'student'`)
- `isAdmin`
- `studyYear` (if already set)
- `schoolLevel` (if already set)
- `yearlyFeePaid`
- `paymentVerified`
- `accountVerified`
- `verified`
- `verificationStatus`

### `isCompletingRegistration()` Rule Function

The only permitted self-escalation is completing the Google signup profile:
- Requires: current `completedProfile === false` AND new value `=== true`
- Requires: current `verificationStatus === 'unverified'` AND new value `=== 'pending'`
- Blocks any role/payment/verification flag changes in the same write

---

## Security Assumptions

1. **Admin provisioning is manual** — admins are added only via Firebase Console or backend Admin SDK script. There is no self-service admin registration.

2. **Client cannot write to sensitive collections** — `supportLessonRegistrations` and `admins` are write-blocked at the rules level.

3. **Capacity enforcement is server-side** — `enrollmentCount` on classes is updated only by the Admin SDK backend, not by client writes. Firestore rules do not enforce the `< capacity` constraint directly (this is a gap — see Audit 7).

4. **Payment verification requires the backend** — payment status transitions (pending → verified/rejected) require authenticated admin API calls through Express, which uses the Admin SDK.

5. **Branch ID comes from the user's Firestore document** — not from the URL or user input. This prevents branch impersonation after login.
