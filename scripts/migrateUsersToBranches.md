# User Migration Script

## Overview

This script migrates existing users from the flat `/users` collection to the branch-scoped structure: `branches/{branchId}/users/{userId}`.

## Prerequisites

1. Firebase Admin SDK installed: `npm install firebase-admin`
2. Service account key file (JSON) from Firebase Console
3. Node.js installed

## Setup

1. **Get Firebase Service Account Key:**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely

2. **Update the script:**
   - Open `scripts/migrateUsersToBranches.js`
   - Update line 12 with the path to your service account key:
   ```javascript
   const serviceAccount = require('../path/to/your/serviceAccountKey.json');
   ```

## Usage

```bash
node scripts/migrateUsersToBranches.js
```

## What the Script Does

1. **Reads** all users from `/users` collection
2. **Validates** each user has a `branchId` field
3. **Checks** if user already exists in branch path (skips if exists)
4. **Copies** user document to `branches/{branchId}/users/{userId}`
5. **Preserves** all user data including timestamps
6. **Reports** success/error statistics

## Safety Features

- ✅ Does NOT delete original `/users` collection
- ✅ Skips users that already exist in branch paths
- ✅ Validates branchId before migration
- ✅ Provides detailed logging and error handling

## After Migration

1. **Verify** the migrated users in Firestore Console
2. **Test** the admin dashboard to ensure users appear correctly
3. **Test** user login to ensure profiles load correctly
4. **Once verified**, you can manually delete the old `/users` collection if desired

## Rollback

If something goes wrong, the original `/users` collection is still intact. Simply:
1. Delete the migrated users from branch paths
2. Fix any issues
3. Re-run the migration script

## Notes

- Users without `branchId` will be skipped
- Users with invalid `branchId` (not 'boumerdes' or 'bordj_menaiel') will be skipped
- The script preserves all user fields including `createdAt`, `updatedAt`, etc.








