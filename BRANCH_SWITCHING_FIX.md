# Branch Switching Logic Fix

## Problem Identified
When logging in with `bordj_mnaiel` admin:
- System correctly detected admin branch: "bordj_mnaiel" 
- Then immediately forced logout due to branch mismatch
- Issue was in `AuthContext.js` line 392-400: forced logout when `profileBranch !== selectedBranchId`

## Root Cause
1. **Forced Logout Logic**: AuthContext had logic to sign out users when branch didn't match selected branch
2. **No Branch Auto-Setting**: When admin logged in, their branch wasn't automatically set in BranchContext
3. **Hardcoded Defaults**: Some components had hardcoded branch assumptions

## ✅ Fixes Applied

### 1. Removed Forced Logout (AuthContext.js)
**Before:**
```javascript
// If branch changes while user is logged in, force logout
useEffect(() => {
  if (user && profileBranch && selectedBranchId && profileBranch !== selectedBranchId) {
    console.log('🔄 Branch switched while logged in; signing out to enforce branch-specific session.');
    signOut(auth).catch((e) => console.error('Error signing out on branch switch:', e));
    setRole(null);
    setProfileBranch(null);
    setUser(null);
  }
}, [selectedBranchId, user, profileBranch]);
```

**After:**
```javascript
// For admins, set the selected branch to match their assigned branch
useEffect(() => {
  if (role === 'admin' && adminData && adminData.branchId) {
    // Only update if different to avoid infinite loops
    if (selectedBranchId !== adminData.branchId) {
      console.log('🏢 Admin detected, setting branch to:', adminData.branchId);
      // Branch setting handled via custom event
    }
  }
}, [role, adminData, selectedBranchId]);
```

### 2. Added Branch Auto-Setting (AuthContext.js)
Added logic to automatically set admin's branch when they log in:
```javascript
// Set the branch context to match admin's assigned branch
if (selectedBranchId !== adminInfo.branchId) {
  console.log('🏢 Setting branch context to admin branch:', adminInfo.branchId);
  localStorage.setItem('branchId', adminInfo.branchId);
  window.dispatchEvent(new CustomEvent('adminBranchSet', { 
    detail: { branchId: adminInfo.branchId } 
  }));
}
```

### 3. Updated BranchContext (BranchContext.js)
**Enhanced selectBranch function:**
- Added admin check before forcing logout
- Only non-admin users get logged out when switching branches
- Added Firestore admin document lookup

**Added event listener:**
```javascript
useEffect(() => {
  const handleAdminBranchSet = (event) => {
    const { branchId } = event.detail;
    console.log('🏢 BranchContext received admin branch set event:', branchId);
    setSelectedBranchId(branchId);
    localStorage.setItem('branchId', branchId);
    // Update full branch object if available
    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      setSelectedBranch(branch);
      localStorage.setItem('selectedBranch', JSON.stringify(branch));
    }
  };

  window.addEventListener('adminBranchSet', handleAdminBranchSet);
  return () => window.removeEventListener('adminBranchSet', handleAdminBranchSet);
}, [branches]);
```

### 4. Added Required Imports
- Added `doc, getDoc` imports to BranchContext.js for admin document lookup

## 🧪 Testing

### Test Steps:
1. Login with `trustschoolamara@gmail.com` (bordj_mnaiel admin)
2. Check console for:
   - `"👑 User is admin for branch: bordj_mnaiel"`
   - `"🏢 Setting branch context to admin branch: bordj_mnaiel"`
   - `"🏢 BranchContext received admin branch set event: bordj_mnaiel"`
3. Verify no logout occurs
4. Verify admin sees only bordj_mnaiel data

### Expected Behavior:
- ✅ Both admins can log in successfully
- ✅ No forced logout after login
- ✅ Each admin sees only their assigned branch data
- ✅ Branch context automatically set to admin's branch
- ✅ Non-admin users still get logged out when switching branches (security)

## 🔒 Security Maintained

### For Admins:
- Can only access their assigned branch (enforced by Firestore rules)
- Can stay logged in when branch context updates
- Branch switching works without logout

### For Non-Admin Users:
- Still logged out when switching branches (maintains isolation)
- Can only access their enrolled branch
- Cannot access other branches' data

## 📁 Files Modified

1. **src/contexts/AuthContext.js**
   - Removed forced logout logic
   - Added admin branch auto-setting
   - Added custom event dispatch

2. **src/contexts/BranchContext.js** 
   - Added admin check to selectBranch function
   - Added event listener for admin branch setting
   - Added required Firestore imports

3. **src/utils/testAdminLogin.js** (new)
   - Test utility for verifying admin login flow

## 🚀 Next Steps

1. **Deploy Changes**: Ensure updated code is deployed
2. **Test Both Admins**: Verify both `boumerdes` and `bordj_mnaiel` admins can log in
3. **Test Data Isolation**: Confirm each admin only sees their branch data
4. **Test Branch Switching**: Verify non-admin users still get logged out when switching
5. **Monitor Logs**: Check for any unexpected logout events

## 🐛 Troubleshooting

If logout still occurs:
1. Check browser console for branch mismatch logs
2. Verify admin document exists in Firestore
3. Check localStorage for correct `branchId` value
4. Ensure Firestore security rules are deployed
5. Test with `window.testAdminLogin()` utility
