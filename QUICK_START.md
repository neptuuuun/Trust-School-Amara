# 🚨 URGENT: Quick Start Guide - User Registration Fix

**Read `URGENT_FIX_INSTRUCTIONS.md` first if you're seeing permission errors!**

## Prerequisites

Before deploying the user registration fix, ensure you have:

1. Firebase project with Firestore enabled
2. Supabase project with Storage enabled
3. Environment variables configured
4. Admin access to both Firebase and Supabase

## Setup Steps

### 1. Environment Variables

Create/update your `.env` file in the project root:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_FIREBASE_API_KEY=your-firebase-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
REACT_APP_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

### 2. Supabase Storage Setup

#### Create Bucket

1. Go to Supabase Dashboard → Storage
2. Click "New Bucket"
3. Name: `user-uploads`
4. **Public**: ✅ Yes
5. File size limit: 5242880 bytes (5MB)
6. Allowed MIME types: `image/*`

#### Apply Storage Policies

Go to Supabase Dashboard → SQL Editor and run:

```sql
-- Policy 1: Public read access
CREATE POLICY IF NOT EXISTS "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-uploads');

-- Policy 2: Authenticated users can upload
CREATE POLICY IF NOT EXISTS "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 3: Users can update own files
CREATE POLICY IF NOT EXISTS "Users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### 3. Deploy Code

```bash
# Install dependencies if needed
npm install

# Build the project
npm run build

# Deploy to Firebase
firebase deploy
```

### 4. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

Or manually copy the contents of `firestore.rules` to Firebase Console → Firestore → Rules.

### 5. Run Migration

1. **Log in** to admin panel at `/admin`
2. Navigate to **ترحيل المستخدمين** (Migration page)
3. Click **محاكاة الترحيل** to preview
4. Review the dry run report
5. Click **تشغيل الترحيل** to migrate
6. Click **التحقق من الترحيل** to verify

**⚠️ Important:** Only run cleanup after verifying migration is successful!

### 6. Test

#### Test New Registration

1. Go to `/register`
2. Fill in the form with test data
3. Upload profile photo and ID card
4. Submit registration
5. Verify user appears in `/admin/users` with photos

#### Test Login

1. Log in with the new test account
2. Verify dashboard loads correctly
3. Verify profile information displays

#### Test Admin Panel

1. Go to `/admin/users`
2. Verify all users (including migrated) appear
3. Click on profile photos to verify they open
4. Click on ID cards to verify they open
5. Test verification toggle buttons

## Verification Checklist

- [ ] Environment variables set
- [ ] Supabase bucket created and public
- [ ] Storage policies applied
- [ ] Firestore rules deployed
- [ ] Migration completed successfully
- [ ] New user registration works
- [ ] Photos upload to Supabase
- [ ] Photos display in admin panel
- [ ] Users can log in
- [ ] Admin panel shows all users
- [ ] Verification buttons work
- [ ] No console errors

## Common Issues

### Issue: Photos not uploading

**Solution:**
1. Check Supabase bucket is public
2. Verify storage policies are applied
3. Check environment variables
4. Check browser console for errors

### Issue: Users not appearing in admin

**Solution:**
1. Check Firestore rules are deployed
2. Verify migration completed
3. Check browser console for errors
4. Try logging out and back in

### Issue: Migration errors

**Solution:**
1. Check network connection
2. Verify Firebase permissions
3. Check browser console for details
4. Try running dry run first

## Rollback

If you need to rollback:

1. Users remain in branch-scoped collections
2. Update code to previous version
3. Redeploy previous Firebase rules
4. Clear browser cache

## Support

For detailed documentation, see `USER_REGISTRATION_FIX.md`.

For issues:
1. Check browser console
2. Check Firebase Console → Firestore
3. Check Supabase Dashboard → Storage
4. Review documentation files

## Next Steps

After successful setup:

1. Monitor migration completion
2. Verify all users migrated
3. Run cleanup (optional, permanent!)
4. Test all functionality
5. Inform users of any changes

## Timeline

Estimated setup time:
- Environment setup: 10 minutes
- Supabase configuration: 15 minutes
- Code deployment: 5 minutes
- Migration: 5-30 minutes (depends on user count)
- Testing: 15 minutes

**Total:** ~1 hour

