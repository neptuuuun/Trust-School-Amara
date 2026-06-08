/**
 * End-to-end test: admin-created student flow
 * ============================================
 *
 * Run from the repo root:
 *   node scripts/e2eTestAdminStudent.js
 *
 * Requires backend/.env with Firebase credentials.
 *
 * What it tests
 * -------------
 *  1.  Admin SDK creates a Firebase Auth user (same path as backend API)
 *  2.  Admin SDK writes the Firestore profile (same path as adminController.js)
 *  3.  Verifies every required field exists and has the correct value
 *  4.  Signs in as the new student via Firebase Auth REST API (real sign-in)
 *  5.  Reads the Firestore profile as the student using the client token
 *      (this validates the deployed Firestore rules)
 *  6.  Simulates every check in RequireStudent + AuthContext.login()
 *  7.  Cleans up (deletes Auth user + Firestore doc)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const admin  = require('firebase-admin');
const https  = require('https');

// ── Firebase Admin init ─────────────────────────────────────────────────────
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    console.error('❌  No Firebase credentials found.');
    process.exit(1);
  }
}

const db   = admin.firestore();
const auth = admin.auth();

const API_KEY    = 'AIzaSyD8mLBRnnuflkQ3lKTHVxxYji0ffPVE780'; // from .env / firebase.js
const BRANCH_ID  = 'boumerdes';
const BRANCH_NAME = 'بومرداس';

// Unique test credentials so this script is safe to re-run
const timestamp   = Date.now();
const TEST_EMAIL  = `test.student.${timestamp}@e2e.trust-school.test`;
const TEST_PASS   = `TestPass${timestamp}!`;
const TEST_NAME   = `طالب اختباري ${timestamp}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function pass(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.error(`  ❌  FAIL: ${msg}`); process.exitCode = 1; }
function info(msg) { console.log(`  ℹ️   ${msg}`); }
function section(title) { console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`); }

function assertField(obj, field, expected, label) {
  const val = obj[field];
  if (expected !== undefined) {
    if (val !== expected) {
      fail(`${label || field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    } else {
      pass(`${label || field} = ${JSON.stringify(val)}`);
    }
  } else {
    // Just check it exists / is not null-ish
    if (val === undefined || val === null || val === '') {
      fail(`${label || field} is missing or empty (got ${JSON.stringify(val)})`);
    } else {
      pass(`${label || field} = ${JSON.stringify(val)}`);
    }
  }
}

// Firebase Auth REST API sign-in
function signInRest(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password, returnSecureToken: true });
    const req  = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path:     `/v1/accounts:signInWithPassword?key=${API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.error) reject(new Error(parsed.error.message));
        else resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Firestore REST API — read a document using a student's idToken
function firestoreGetRest(idToken, path) {
  return new Promise((resolve, reject) => {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'trust-school';
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path:     `/v1/projects/${projectId}/databases/(default)/documents/${path}`,
      method:   'GET',
      headers:  { Authorization: `Bearer ${idToken}` },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.error) reject(new Error(`${parsed.error.status}: ${parsed.error.message}`));
        else resolve(parsed);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Test ─────────────────────────────────────────────────────────────────────

async function run() {
  let uid;

  try {
    // ─────────────────────────────────────────────────────────────────────
    section('STEP 1 — Create Firebase Auth user (same as adminController.js)');
    // ─────────────────────────────────────────────────────────────────────
    const now    = new Date();
    const year   = now.getFullYear();
    const month  = String(now.getMonth() + 1).padStart(2, '0');
    const rand   = Math.floor(1000 + Math.random() * 9000);
    const prefix = BRANCH_ID.slice(0, 4).toUpperCase();
    const registrationNumber = `${prefix}-${year}${month}-${rand}`;

    const userRecord = await auth.createUser({
      email:         TEST_EMAIL,
      password:      TEST_PASS,
      displayName:   TEST_NAME,
      emailVerified: true,
    });
    uid = userRecord.uid;
    pass(`Firebase Auth user created: ${uid}`);
    assertField(userRecord, 'uid', uid, 'Auth.uid');
    assertField(userRecord, 'email', TEST_EMAIL, 'Auth.email');
    assertField(userRecord, 'emailVerified', true, 'Auth.emailVerified');
    assertField(userRecord, 'displayName', TEST_NAME, 'Auth.displayName');

    // ─────────────────────────────────────────────────────────────────────
    section('STEP 2 — Write Firestore profile (same as adminController.js)');
    // ─────────────────────────────────────────────────────────────────────
    const profilePayload = {
      uid,
      name:               TEST_NAME,
      fullName:           TEST_NAME,
      email:              TEST_EMAIL,
      phoneNumber:        null,
      phone:              null,
      branch:             BRANCH_ID,
      branchId:           BRANCH_ID,
      branchName:         BRANCH_NAME,
      role:               'student',
      status:             'active',
      emailVerified:      true,
      verified:           true,
      accountVerified:    true,
      verificationStatus: 'verified',
      paymentVerified:    false,
      yearlyFeePaid:      false,
      studyYear:          null,
      birthDate:          null,
      birthPlace:         null,
      address:            null,
      photoUrl:           null,
      idCardUrl:          null,
      verificationRequest: null,
      registrationNumber,
      internalRulesAccepted: true,
      completedProfile:   true,
      createdByAdmin:     true,
      createdBy:          'e2e-test',
      lifecycleStatus:    'active',
      lifecycleStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt:     admin.firestore.FieldValue.serverTimestamp(),
      lastActivityType:   'admin_account_creation',
      createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('branches').doc(BRANCH_ID).collection('users').doc(uid).set(profilePayload);
    pass('Firestore profile written');

    // ─────────────────────────────────────────────────────────────────────
    section('STEP 3 — Verify Firestore document field-by-field (Admin SDK read)');
    // ─────────────────────────────────────────────────────────────────────
    const snap = await db.collection('branches').doc(BRANCH_ID).collection('users').doc(uid).get();
    if (!snap.exists) { fail('Document does not exist'); return; }
    const data = snap.data();
    info(`Document path: branches/${BRANCH_ID}/users/${uid}`);

    // UID consistency
    assertField(data, 'uid', uid, 'Firestore.uid matches Auth.uid');

    // Name fields
    assertField(data, 'name',     TEST_NAME, 'name');
    assertField(data, 'fullName', TEST_NAME, 'fullName');

    // Contact
    assertField(data, 'email', TEST_EMAIL, 'email');
    // phone is null — just check the field exists
    if (!('phone'       in data)) fail('phone field missing');
    else pass('phone field exists (null)');
    if (!('phoneNumber' in data)) fail('phoneNumber field missing');
    else pass('phoneNumber field exists (null)');

    // Branch
    assertField(data, 'branch',     BRANCH_ID,   'branch');
    assertField(data, 'branchId',   BRANCH_ID,   'branchId');
    assertField(data, 'branchName', BRANCH_NAME, 'branchName');

    // Identity
    assertField(data, 'role',   'student', 'role');
    assertField(data, 'status', 'active',  'status');

    // Verification
    assertField(data, 'emailVerified',      true,       'emailVerified');
    assertField(data, 'verified',           true,       'verified');
    assertField(data, 'accountVerified',    true,       'accountVerified');
    assertField(data, 'verificationStatus', 'verified', 'verificationStatus');

    // Payment flags
    assertField(data, 'paymentVerified', false, 'paymentVerified');
    assertField(data, 'yearlyFeePaid',   false, 'yearlyFeePaid');

    // Registration
    assertField(data, 'registrationNumber', registrationNumber, 'registrationNumber');

    // Profile completeness
    assertField(data, 'completedProfile',     true, 'completedProfile');
    assertField(data, 'internalRulesAccepted', true, 'internalRulesAccepted');

    // Nullable fields exist
    for (const f of ['birthDate','birthPlace','address','photoUrl','idCardUrl','verificationRequest','studyYear']) {
      if (!(f in data)) fail(`${f} field missing`);
      else pass(`${f} field exists (null)`);
    }

    // Timestamps
    if (!data.createdAt) fail('createdAt missing');
    else pass('createdAt set');
    if (!data.updatedAt) fail('updatedAt missing');
    else pass('updatedAt set');

    // Lifecycle
    assertField(data, 'lifecycleStatus', 'active', 'lifecycleStatus');

    // ─────────────────────────────────────────────────────────────────────
    section('STEP 4 — Sign in as new student via REST (real Firebase Auth)');
    // ─────────────────────────────────────────────────────────────────────
    let idToken;
    try {
      const signInResult = await signInRest(TEST_EMAIL, TEST_PASS);
      idToken = signInResult.idToken;
      pass(`Sign-in succeeded — idToken received (${idToken.slice(0, 30)}...)`);
      assertField(signInResult, 'localId', uid, 'signIn.localId matches uid');
      assertField(signInResult, 'email', TEST_EMAIL, 'signIn.email');
    } catch (e) {
      fail(`Sign-in failed: ${e.message}`);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    section('STEP 5 — Read Firestore profile AS THE STUDENT (tests rules)');
    // ─────────────────────────────────────────────────────────────────────
    try {
      const fsDoc = await firestoreGetRest(idToken, `branches/${BRANCH_ID}/users/${uid}`);
      pass('Firestore read as student succeeded — no permission-denied error');
      // Verify the REST response contains expected fields
      const fields = fsDoc.fields || {};
      const getName = (f) => {
        const fv = fields[f];
        if (!fv) return undefined;
        return fv.stringValue ?? fv.booleanValue ?? fv.nullValue ?? fv.timestampValue ?? '(present)';
      };
      if (getName('name') === TEST_NAME) pass('name field visible to student');
      else fail(`name field mismatch: got ${getName('name')}`);
      if (getName('status') === 'active') pass('status = active visible to student');
      else fail(`status mismatch: got ${getName('status')}`);
      if (getName('role') === 'student') pass('role = student visible to student');
      else fail(`role mismatch: got ${getName('role')}`);
    } catch (e) {
      fail(`Firestore read as student failed: ${e.message}`);
    }

    // ─────────────────────────────────────────────────────────────────────
    section('STEP 6 — Simulate AuthContext.login() & RequireStudent checks');
    // ─────────────────────────────────────────────────────────────────────
    info('Simulating AuthContext.login() guard checks...');

    const role             = data.role || 'student';
    const branchId         = data.branch || data.branchId || BRANCH_ID;
    const vs               = String(data.verificationStatus || '').toLowerCase();
    const accountVerified  = data.verified === true || data.accountVerified === true || vs === 'verified';
    const profileComplete  = data.completedProfile !== false;
    const emailVerified_fs = data.emailVerified === true;
    const statusVal        = data.status;

    assertField({ role }, 'role', 'student',  'AuthContext: role');
    assertField({ branchId }, 'branchId', BRANCH_ID, 'AuthContext: branchId resolved');

    if (accountVerified) pass('RequireStudent: verificationStatus = verified → no "pending review" block');
    else fail('RequireStudent: account is NOT verified → would show "pending review" screen');

    if (profileComplete) pass('RequireStudent: completedProfile = true → no Google stub redirect');
    else fail('RequireStudent: completedProfile = false → would redirect to /complete-registration');

    if (emailVerified_fs) pass('RequireStudent: emailVerified = true → no email confirmation block');
    else fail('RequireStudent: emailVerified = false → would block with email confirmation screen');

    if (statusVal === 'active') pass('AuthContext: status = active → accountStatus set correctly');
    else fail(`AuthContext: status is "${statusVal}" instead of "active"`);

    info('→ Student would reach StudentDashboard with no blocks ✅');

    // ─────────────────────────────────────────────────────────────────────
    section('STEP 7 — Cleanup');
    // ─────────────────────────────────────────────────────────────────────
    await db.collection('branches').doc(BRANCH_ID).collection('users').doc(uid).delete();
    await auth.deleteUser(uid);
    pass(`Test student deleted (uid: ${uid})`);

  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
    console.error(err);
    // Attempt cleanup even on failure
    if (uid) {
      try {
        await db.collection('branches').doc(BRANCH_ID).collection('users').doc(uid).delete();
        await auth.deleteUser(uid);
        info('Cleanup completed despite error');
      } catch (_) {}
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  section('TEST RESULT');
  // ─────────────────────────────────────────────────────────────────────
  if (process.exitCode === 1) {
    console.error('\n❌  One or more checks FAILED. See output above.\n');
  } else {
    console.log('\n✅  ALL CHECKS PASSED\n');
  }
}

run().catch((err) => { console.error('Fatal:', err); process.exit(1); });
