# KEY ROTATION GUIDE

**Follow these steps in order. Do not skip any step.**

---

## Why You Must Do This

Three secrets have been exposed on this machine:
1. `serviceAccountKey.json` — Firebase Admin SDK private key (full admin access to Firebase)
2. Firebase API key — embedded in production build bundle
3. Supabase anon key — embedded in production build bundle

The service account key is the most critical. Whoever holds it can read/write any Firestore document, create/delete any Firebase Auth user, and bypass all security rules.

---

## STEP 1 — Revoke the Firebase Service Account Key (CRITICAL — Do This First)

1. Open: https://console.firebase.google.com → Select project **trust-school**
2. Go to: Project Settings (gear icon) → **Service accounts** tab
3. Click **Manage service account permissions** (opens Google Cloud Console)
4. In Google Cloud Console: **IAM & Admin → Service Accounts**
5. Find the service account used for this project (email ends in `@trust-school.iam.gserviceaccount.com`)
6. Click on it → **Keys** tab
7. Find the key with ID starting with `904e335d` → click the three-dot menu → **Delete key**
8. Confirm deletion

The old `serviceAccountKey.json` on your machine is now permanently revoked.

---

## STEP 2 — Generate a New Service Account Key

1. Still in Google Cloud Console → same service account → **Keys** tab
2. Click **Add Key → Create new key → JSON → Create**
3. A new `.json` file downloads automatically
4. **IMPORTANT: Move this file OUTSIDE the project folder:**
   - Recommended path: `C:\Users\PC\trust-school-serviceAccount.json`
   - Do NOT put it inside `school-website-react\` or any subfolder
5. Update `backend/.env` to point to the new location:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=C:\Users\PC\trust-school-serviceAccount.json
   ```
6. Delete the old `serviceAccountKey.json` from the project root:
   ```powershell
   Remove-Item "C:\Users\PC\Desktop\Projects\New folder (5)\school-website-react\serviceAccountKey.json"
   ```

---

## STEP 3 — Restrict the Firebase API Key

The Firebase web API key is semi-public by design, but it should be domain-restricted so it only works from your production site.

1. Open: https://console.cloud.google.com → Select project **trust-school**
2. Go to: **APIs & Services → Credentials**
3. Find the API key named "Browser key (auto created by Firebase)" or similar
4. Click **Edit** (pencil icon)
5. Under **Application restrictions**: select **HTTP referrers (websites)**
6. Add your allowed domains:
   ```
   https://trust-school.web.app/*
   https://trust-school.firebaseapp.com/*
   http://localhost:3000/*
   ```
7. Click **Save**

> Note: After adding restrictions, you do NOT need to change the key value in your `.env` — the same key works, it just now refuses requests from unauthorized domains.

---

## STEP 4 — Rotate the Supabase Anon Key

1. Open: https://supabase.com/dashboard → Select project **jzplbnzmsfbsmeaobamg**
2. Go to: **Project Settings → API**
3. Under "Project API keys", find the **anon / public** key
4. Click **Regenerate** → confirm
5. Copy the new anon key
6. Update `school-website-react/.env`:
   ```
   REACT_APP_SUPABASE_ANON_KEY=<paste new key here>
   ```

> Note: The Supabase URL (`REACT_APP_SUPABASE_URL`) does not change — only the key.

---

## STEP 5 — Verify Supabase Row Level Security

While in Supabase:
1. Go to: **Table Editor** or **Database → Tables**
2. For every table, verify **RLS is enabled** (green "RLS enabled" badge)
3. Check that RLS policies exist and are correct

If any table has RLS disabled, data in that table is accessible to anyone with the anon key.

---

## STEP 6 — Rebuild and Redeploy the Frontend

The old build bundle contains the old Supabase anon key. After rotation, a new build is required:

```bash
# From the project root
npm run build
```

Then deploy the new build to Firebase Hosting:
```bash
firebase deploy --only hosting
```

---

## STEP 7 — Verify Rotation Is Complete

Run these checks after completing all steps:

```powershell
# 1. Old serviceAccountKey.json should be gone
Test-Path "C:\Users\PC\Desktop\Projects\New folder (5)\school-website-react\serviceAccountKey.json"
# Expected: False

# 2. backend/.env should point to new key path
Get-Content "C:\Users\PC\Desktop\Projects\New folder (5)\school-website-react\backend\.env" | Select-String "GOOGLE_APPLICATION_CREDENTIALS"
# Expected: path outside the project directory

# 3. New key file should exist at the new path
Test-Path "C:\Users\PC\trust-school-serviceAccount.json"
# Expected: True

# 4. Frontend .env should have the new Supabase key (confirm it changed)
Get-Content "C:\Users\PC\Desktop\Projects\New folder (5)\school-website-react\.env" | Select-String "SUPABASE_ANON_KEY"
# Verify the key value has changed from the old one
```

---

## STEP 8 — For Production Deployment (Backend)

Instead of using a key file on disk, encode the new key as base64 and set it as an environment variable on your hosting platform:

```powershell
# Windows PowerShell — copies base64 string to clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\PC\trust-school-serviceAccount.json")) | Set-Clipboard
```

Then in your backend host (Railway / Render / Heroku):
- Add environment variable: `FIREBASE_SERVICE_ACCOUNT_BASE64` = (paste from clipboard)
- Remove `GOOGLE_APPLICATION_CREDENTIALS` from production env vars

---

## Summary of Files to Update After Rotation

| File | What to Update |
|---|---|
| `school-website-react/.env` | `REACT_APP_SUPABASE_ANON_KEY` = new key |
| `backend/.env` | `GOOGLE_APPLICATION_CREDENTIALS` = new path (outside project) |
| Production backend env vars | `FIREBASE_SERVICE_ACCOUNT_BASE64` = new base64 key |
| Firebase Console | API key restricted to your domains |
| Project root | Delete `serviceAccountKey.json` |
