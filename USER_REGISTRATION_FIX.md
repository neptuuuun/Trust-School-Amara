# User Registration System Fix - Implementation Guide

## Summary

This document describes the fix for the user registration system in the Trust School application. Previously, users were being saved incorrectly under `branches/{branchId}/users/` which caused them not to appear in the admin panel. Now all users are saved in the root `users/` collection with photos stored in Supabase Storage.

## Changes Made

### 1. New Files Created

#### `src/services/userService.js`
Centralized service for user management with:
- `uploadToSupabase()` - Uploads files to Supabase Storage
- `registerUser()` - Registers new users with photos
- `getAllUsers()` - Fetches all users from root collection
- `getUserById()` - Gets a single user by ID
- `updateVerificationStatus()` - Updates verification status
- `updateUser()` - Generic user update function

#### `src/utils/migrationScript.js`
Script to migrate existing users from branches to root collection:
- `migrateUsersToRoot()` - Migrate users with dry-run support
- `verifyMigration()` - Verify migration results
- `cleanupOldLocations()` - Delete old branch-scoped users (USE WITH CAUTION)
- `runFullMigration()` - Run all migration steps

#### `src/admin/pages/MigrationPage.jsx`
Admin interface for running user migration with:
- Dry run migration
- Actual migration
- Verification
- Full migration process
- Cleanup of old locations

### 2. Modified Files

#### `src/contexts/AuthContext.js`
- Updated to read from root `users/` collection
- Added backward compatibility to check branch-scoped collection
- Updated `signup()` to create minimal user in root collection

#### `src/pages/RegisterPage.js`
- Removed duplicate `uploadToSupabase()` function
- Now uses `userService.registerUser()` for all registration logic
- Simplified registration flow

#### `src/admin/pages/UsersPage.js`
- Uses `userService.getAllUsers()` to fetch users
- Uses `userService.updateVerificationStatus()` for updates
- Switched from real-time listener to polling every 30 seconds

#### `src/admin/AdminDashboard.js`
- Added MigrationPage to navigation
- Added Database icon import

#### `firestore.rules`
- Already has proper rules for root `users/` collection
- No changes needed

## User Data Structure

Users in the root `users/` collection have the following structure:

```javascript
{
  uid: string,                    // Firebase Auth UID
  email: string,                  // Email address
  fullName: string,               // Full name
  birthDate: string,              // Date of birth
  birthPlace: string,             // Place of birth
  address: string,                // Full address
  phoneNumber: string,            // Phone number
  phone: string,                  // Alias for phoneNumber
  photoUrl: string,               // Supabase URL for profile photo
  idCardUrl: string,              // Supabase URL for ID card
  accountVerified: boolean,       // Account verification status
  paymentVerified: boolean,       // Payment verification status
  verified: boolean,              // Alias for accountVerified
  yearlyFeePaid: boolean,         // Alias for paymentVerified
  role: 'student',                // User role
  branchId: string,               // Branch ID
  branchName: string,             // Branch name
  registrationNumber: string,     // Unique registration number
  createdAt: timestamp,           // Creation timestamp
  updatedAt: timestamp            // Last update timestamp
}
```

## Supabase Storage

### Bucket Configuration
- **Bucket Name**: `user-uploads`
- **Public**: Yes
- **File Size Limit**: 5MB
- **Allowed Types**: image/*

### Storage Structure
```
user-uploads/
  {userId}/
    userPhoto.{ext}    # Profile photo
    idPhoto.{ext}      # ID card photo
```

### Storage Policies (Run in Supabase SQL Editor)

```sql
-- Public read access
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-uploads');

-- Authenticated upload
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Update own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## Environment Variables

Ensure the following environment variables are set in your `.env` file:

```env
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Migration Process

### Step 1: Deploy Updated Code

Deploy the updated code to your Firebase hosting:

```bash
npm run build
firebase deploy
```

### Step 2: Deploy Firestore Rules

Deploy updated Firestore security rules:

```bash
firebase deploy --only firestore:rules
```

### Step 3: Run Migration

1. Log in to the admin panel
2. Navigate to **ترحيل المستخدمين** (Migration)
3. Click **محاكاة الترحيل (Dry Run)** to preview changes
4. Review the dry run report
5. Click **تشغيل الترحيل** to perform actual migration
6. Click **التحقق من الترحيل** to verify results
7. (Optional) Click **حذف المستخدمين من الفروع** to cleanup (DO THIS LAST!)

### Step 4: Verify

- Check that all users appear in `/admin/users`
- Verify that profile photos and ID cards display correctly
- Test user login with migrated accounts

## Backward Compatibility

The system maintains backward compatibility during the migration period:

1. **Authentication**: Checks root collection first, falls back to branch-scoped
2. **Registration**: New users are only saved to root collection
3. **Existing Users**: Can log in from either location until migrated

## Testing Checklist

After implementation, verify:

- [ ] New user registration saves to `users/{uid}` (check Firebase Console)
- [ ] Photos upload to `user-uploads/{uid}/` in Supabase
- [ ] `photoUrl` and `idCardUrl` contain valid Supabase URLs
- [ ] Admin panel displays all users with photos
- [ ] Clicking photos opens modal with full image
- [ ] Verification buttons update status in Firestore
- [ ] No console errors
- [ ] All existing users migrated successfully

## Troubleshooting

### Photos Not Displaying
- Check Supabase bucket exists and is public
- Verify storage policies are applied
- Check browser console for CORS errors
- Verify `photoUrl` and `idCardUrl` are valid Supabase URLs

### Users Not Appearing in Admin Panel
- Check Firebase Console → Firestore → `users` collection
- Verify Firestore rules allow admin read access
- Check browser console for permission errors

### Migration Errors
- Check Firebase Console for any failed writes
- Verify network connectivity during migration
- Check browser console for detailed error messages

### Login Issues
- Clear browser cache and localStorage
- Check if user exists in root collection
- Try logging out and back in

## Rollback Plan

If you need to rollback:

1. All existing branch-scoped users remain untouched
2. New users in root collection can be manually migrated back
3. Update `AuthContext.js` to revert to branch-scoped collections
4. Redeploy previous version

## Security Considerations

1. **Supabase Storage**: File size limits enforced (5MB)
2. **Firestore Rules**: Admin-only access for sensitive operations
3. **Authentication**: Users can only update their own data
4. **Migration**: Requires explicit admin confirmation

## Future Improvements

1. Add real-time updates to UsersPage (currently polling)
2. Add bulk verification actions
3. Add user search and filtering
4. Add export functionality (CSV/Excel)
5. Add user activity logging

## Support

For issues or questions:
1. Check this documentation
2. Review browser console errors
3. Check Firebase Console logs
4. Contact development team

## License

This fix is part of the Trust School application.












