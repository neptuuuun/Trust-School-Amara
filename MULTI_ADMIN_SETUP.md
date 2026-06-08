# Multi-Admin System Setup Guide

## Overview
This document outlines the steps to set up the multi-admin system for the Trust School application.

## ✅ Completed Changes

### 1. Authentication System
- **Firebase Auth**: Email/Password authentication enabled
- **Admin Service**: Created `src/services/adminService.js` for admin management
- **Auth Context**: Updated to use new admin system instead of hardcoded emails

### 2. Firestore Structure
- **Admins Collection**: New collection at `/admins/{uid}` with structure:
  ```javascript
  {
    email: "admin@example.com",
    branchId: "boumerdes", // or "bordj_mnaiel"
    role: "admin",
    createdAt: timestamp,
    updatedAt: timestamp
  }
  ```

### 3. Security Rules
- **Updated**: `firestore.rules` with branch-based access control
- **Features**: Admins can only access their assigned branch data

### 4. Frontend Updates
- **Admin Login**: Updated to check admins collection instead of email whitelist
- **Protected Routes**: Updated to use new admin verification
- **Branch Data Hook**: Created `src/hooks/useBranchData.js` for branch-based queries

## 🔧 Setup Instructions

### Step 1: Create Firebase Auth Users
1. Go to Firebase Console → Authentication → Users
2. Create these users with Email/Password authentication:

   **Boumerdes Admin:**
   - Email: `trustschoolamarabmrds@gmail.com`
   - Branch: boumerdes
   - Set a secure password

   **Bordj Mnaiel Admin:**
   - Email: `trustschoolamara@gmail.com`
   - Branch: bordj_mnaiel
   - Set a secure password

### Step 2: Get User UIDs
1. After creating users, click on each user to see their UID
2. Copy the UIDs (they look like: `abc123xyz456...`)

### Step 3: Create Admin Documents
Run the setup script or manually create documents:

```javascript
// Option 1: Use the setup script
import { createAdminDocuments } from './src/utils/setupAdminAccounts.js';
const results = await createAdminDocuments([uid1, uid2]);

// Option 2: Manual creation in Firebase Console
// Collection: admins
// Document ID: [USER_UID]
// Fields:
// - email: "trustschoolamarabmrds@gmail.com"
// - branchId: "boumerdes"
// - role: "admin"
// - createdAt: timestamp
// - updatedAt: timestamp
```

### Step 4: Deploy Firestore Rules
1. Go to Firebase Console → Firestore Database → Rules
2. Replace existing rules with the content from `firestore.rules`
3. Click "Publish"

## 🔒 Security Features

### Branch Isolation
- Each admin can only access their assigned branch
- Firestore rules enforce data isolation at the database level
- Frontend queries are automatically filtered by branch

### Admin Access Control
- Admin status is determined by presence in `/admins/{uid}` collection
- No hardcoded email lists in the application
- Real-time admin status updates

### Data Protection
- Users can only access their own data
- Admins can only manage users in their branch
- Payment data is branch-restricted

## 🧪 Testing

### Test Admin Access
1. Login with `trustschoolamarabmrds@gmail.com`
2. Verify you only see Boumerdes branch data
3. Try to access other branch URLs - should be blocked

### Test Data Isolation
1. Create test data in Boumerdes branch
2. Login with Bordj Mnaiel admin
3. Verify Boumerdes data is not visible

### Test Security Rules
1. Use Firestore emulator or console to test rules
2. Verify cross-branch access is denied
3. Check that users can only access their own data

## 📁 Modified Files

### Core Files
- `src/contexts/AuthContext.js` - Updated authentication logic
- `src/services/adminService.js` - New admin management service
- `src/admin/AdminLogin.js` - Updated login flow
- `src/admin/ProtectedRoute.js` - Updated route protection
- `firestore.rules` - New security rules

### Hooks & Utilities
- `src/hooks/useBranchData.js` - Branch-based data fetching
- `src/utils/setupAdminAccounts.js` - Setup script

### Updated Components
- `src/admin/pages/PaymentsVerification.js` - Removed hardcoded admin emails

## 🚀 Deployment

1. **Update Environment**: Ensure all environment variables are set
2. **Deploy Rules**: Update Firestore security rules
3. **Create Admins**: Set up admin accounts and documents
4. **Test**: Verify all functionality works as expected
5. **Monitor**: Check logs for any access issues

## 🐛 Troubleshooting

### Common Issues

**Admin can't login:**
- Check if admin document exists in `/admins/{uid}`
- Verify `branchId` matches exactly
- Check Firestore rules are deployed

**Cross-branch data visible:**
- Verify Firestore rules are deployed correctly
- Check frontend is using `useBranchId` hook
- Ensure queries include branch filtering

**Permission denied errors:**
- Check admin document structure
- Verify user UID matches document ID
- Review Firestore rules for any syntax errors

## 📞 Support

For issues with the multi-admin setup:
1. Check Firebase Console logs
2. Verify admin document structure
3. Test with Firestore emulator
4. Review browser console for detailed errors
