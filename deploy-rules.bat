@echo off
echo ==========================================
echo Firebase Firestore Rules Deployment
echo ==========================================
echo.
echo This will deploy the updated Firestore security rules
echo to your Firebase project: trust-school
echo.
pause

echo.
echo Deploying Firestore rules...
firebase deploy --only firestore:rules

echo.
if %errorlevel% equ 0 (
    echo ==========================================
    echo SUCCESS! Rules deployed successfully.
    echo ==========================================
    echo.
    echo Next steps:
    echo 1. Test admin login at /admin/login
    echo 2. Select a branch from dropdown
    echo 3. Verify you can see data
    echo.
    echo See FIREBASE_FIXES_DEPLOYMENT.md for testing checklist
) else (
    echo ==========================================
    echo ERROR! Deployment failed.
    echo ==========================================
    echo.
    echo Troubleshooting:
    echo 1. Make sure Firebase CLI is installed
    echo 2. Run 'firebase login' to authenticate
    echo 3. Check that you're in the correct project
    echo 4. Run 'firebase use trust-school' to select project
)

echo.
pause







