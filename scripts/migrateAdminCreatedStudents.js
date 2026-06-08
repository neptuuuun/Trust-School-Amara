/**
 * Migration: patch all admin-created (and schema-incomplete) student documents
 * ============================================================================
 *
 * Run from the repo root:
 *   node scripts/migrateAdminCreatedStudents.js [--dry-run]
 *
 * Requires the same Firebase credentials as the backend:
 *   set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json
 * OR
 *   set FIREBASE_SERVICE_ACCOUNT_BASE64=<base64-encoded service-account JSON>
 *
 * What it does
 * ------------
 * For every document under branches/{branchId}/users/{uid}:
 *
 *   1. Detects if it was admin-created (createdByAdmin === true) OR has any
 *      required field missing (name, status, registrationNumber, etc.).
 *
 *   2. Applies only the MISSING fields — never overwrites correctly-set data.
 *
 *   3. Optionally updates the Firebase Auth record to set emailVerified: true
 *      for admin-created accounts (they don't go through email confirmation).
 *
 * Flags
 * -----
 *   --dry-run   Print what would change without writing anything.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const admin = require('firebase-admin');

// ── Firebase init (same as backend/config/firebase.js) ─────────────────────
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    console.error(
      '❌  No Firebase credentials found.\n' +
      '   Set FIREBASE_SERVICE_ACCOUNT_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.'
    );
    process.exit(1);
  }
}

const db   = admin.firestore();
const auth = admin.auth();

const BRANCHES = ['boumerdes', 'bordj_menaiel'];
const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };

const DRY_RUN = process.argv.includes('--dry-run');

// ── Registration-number generator (same format as RegisterPage + adminController) ──
function generateRegNumber(branchId) {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const rand   = Math.floor(1000 + Math.random() * 9000);
  const prefix = branchId.slice(0, 4).toUpperCase();
  return `${prefix}-${year}${month}-${rand}`;
}

// ── Determine whether a document needs patching ──────────────────────────────
function buildPatch(uid, branchId, data) {
  const patch = {};

  // Canonical name — must always be present
  if (!data.name && data.fullName) patch.name = data.fullName;
  if (!data.name && !data.fullName) patch.name = '';   // edge case: no name at all

  // fullName alias
  if (!data.fullName && data.name) patch.fullName = data.name;

  // branch alias (AuthContext reads data?.branch || data?.branchId)
  if (!data.branch) patch.branch = branchId;

  // status — the login flow reads this for accountStatus
  if (!data.status) patch.status = data.createdByAdmin ? 'active' : 'pending';

  // registrationNumber
  if (!data.registrationNumber) patch.registrationNumber = generateRegNumber(branchId);

  // completedProfile — false only for Google stubs; must be truthy for all others
  if (data.completedProfile === undefined || data.completedProfile === null) {
    // Google stubs have completedProfile: false explicitly — don't overwrite
    if (data.authProvider !== 'google' || data.completedProfile !== false) {
      patch.completedProfile = true;
    }
  }

  // emailVerified in the Firestore doc (mirrors Firebase Auth state)
  if (data.emailVerified === undefined) {
    patch.emailVerified = Boolean(data.createdByAdmin);
  }

  // internalRulesAccepted
  if (data.internalRulesAccepted === undefined) {
    patch.internalRulesAccepted = Boolean(data.createdByAdmin);
  }

  // photo/idCard URL fields — must exist so pages can safely read them
  if (!('photoUrl'  in data)) patch.photoUrl  = null;
  if (!('idCardUrl' in data)) patch.idCardUrl = null;

  // verificationRequest — used by UsersPage isPending check
  if (!('verificationRequest' in data)) patch.verificationRequest = null;

  // birthDate / birthPlace / address — ensure explicit nulls
  if (!('birthDate'  in data)) patch.birthDate  = null;
  if (!('birthPlace' in data)) patch.birthPlace = null;
  if (!('address'    in data)) patch.address    = null;

  // role
  if (!data.role) patch.role = 'student';

  // phone / phoneNumber aliases
  if (!data.phone && data.phoneNumber)     patch.phone = data.phoneNumber;
  if (!data.phoneNumber && data.phone)     patch.phoneNumber = data.phone;

  // branchName
  if (!data.branchName) patch.branchName = BRANCH_NAMES[branchId] || branchId;

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  return patch;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🔍 Scanning student documents across ${BRANCHES.length} branches…`);
  if (DRY_RUN) console.log('⚠️  DRY-RUN mode — no writes will be made.\n');

  const stats = {
    total:    0,
    patched:  0,
    skipped:  0,
    errors:   0,
    authFixed: 0,
  };

  for (const branchId of BRANCHES) {
    console.log(`\n📂  Branch: ${branchId}`);
    const usersRef = db.collection('branches').doc(branchId).collection('users');
    let snapshot;
    try {
      snapshot = await usersRef.get();
    } catch (err) {
      console.error(`   ❌  Could not read branch ${branchId}:`, err.message);
      stats.errors++;
      continue;
    }

    for (const docSnap of snapshot.docs) {
      stats.total++;
      const uid  = docSnap.id;
      const data = docSnap.data();

      // Skip admin accounts that might be stored here
      if (data.role === 'admin') { stats.skipped++; continue; }

      const patch = buildPatch(uid, branchId, data);

      if (Object.keys(patch).length === 0) {
        stats.skipped++;
        continue;
      }

      const changedFields = Object.keys(patch).filter(k => k !== 'updatedAt');
      console.log(`   ✏️  ${uid} (${data.email || 'no email'})`);
      console.log(`        Fields to patch: ${changedFields.join(', ')}`);

      if (!DRY_RUN) {
        try {
          await usersRef.doc(uid).update(patch);
          stats.patched++;
        } catch (err) {
          console.error(`        ❌  Firestore update failed:`, err.message);
          stats.errors++;
          continue;
        }

        // For admin-created accounts: ensure Firebase Auth emailVerified = true
        if (data.createdByAdmin && patch.emailVerified === true) {
          try {
            await auth.updateUser(uid, { emailVerified: true });
            console.log(`        ✅  Firebase Auth emailVerified set to true`);
            stats.authFixed++;
          } catch (err) {
            // Auth user might not exist — log but don't abort
            console.warn(`        ⚠️  Could not update Auth record:`, err.message);
          }
        }
      } else {
        stats.patched++; // count as "would patch" in dry-run
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('Migration Summary');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total documents scanned : ${stats.total}`);
  console.log(`  Documents ${DRY_RUN ? 'that would be' : ''} patched  : ${stats.patched}`);
  console.log(`  Documents already OK    : ${stats.skipped}`);
  console.log(`  Auth records updated    : ${stats.authFixed}`);
  console.log(`  Errors                  : ${stats.errors}`);
  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN. Re-run without --dry-run to apply changes.');
  } else {
    console.log('\n✅  Migration complete.');
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
