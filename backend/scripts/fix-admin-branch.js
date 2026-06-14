/**
 * Diagnostic + repair script for the admin branchId typo.
 *
 * Symptoms: admin dashboard shows 0 users for bordj_menaiel branch.
 *
 * Root cause: the admins/{uid} document in Firestore may have
 *   branchId: 'bordj_mnaiel'  (typo, missing 'e')
 * instead of the correct
 *   branchId: 'bordj_menaiel'
 *
 * This causes selectedBranchId to be set to the typo value, so the admin
 * queries branches/bordj_mnaiel/users — a collection that does not exist.
 *
 * Usage:
 *   cd backend
 *   node scripts/fix-admin-branch.js          # diagnostic only (dry-run)
 *   node scripts/fix-admin-branch.js --fix    # also applies the correction
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Reuse the same Firebase initialisation as the rest of the backend.
const { admin, db } = require('../config/firebase');
const APPLY_FIX = process.argv.includes('--fix');

const TYPO       = 'bordj_mnaiel';
const CORRECT    = 'bordj_menaiel';
const VALID      = ['boumerdes', 'bordj_menaiel'];

async function main() {
  console.log('\n=== Admin branchId diagnostic ===\n');
  console.log('Mode:', APPLY_FIX ? 'FIX (will write to Firestore)' : 'DRY-RUN (read-only)');
  console.log();

  const snap = await db.collection('admins').get();
  if (snap.empty) {
    console.log('❌ No documents found in admins collection. Check your Firebase project.');
    process.exit(1);
  }

  let problemsFound = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const uid  = docSnap.id;
    console.log(`--- admins/${uid} ---`);
    console.log('  email   :', data.email   || '(missing)');
    console.log('  role    :', data.role    || '(missing)');
    console.log('  branchId:', data.branchId || '(missing)');

    if (!data.branchId) {
      console.log('  ⚠️  branchId is missing!');
      problemsFound++;
    } else if (data.branchId === TYPO) {
      console.log(`  ❌ TYPO DETECTED: "${TYPO}" → should be "${CORRECT}"`);
      problemsFound++;
      if (APPLY_FIX) {
        await db.collection('admins').doc(uid).update({
          branchId: CORRECT,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`  ✅ FIXED: branchId updated to "${CORRECT}"`);
      } else {
        console.log(`  ℹ️  Run with --fix to apply the correction.`);
      }
    } else if (!VALID.includes(data.branchId)) {
      console.log(`  ⚠️  Unknown branchId: "${data.branchId}" (expected one of: ${VALID.join(', ')})`);
      problemsFound++;
    } else {
      console.log(`  ✅ branchId is valid: "${data.branchId}"`);
    }
    console.log();
  }

  if (problemsFound === 0) {
    console.log('✅ All admin documents look correct.');
    console.log('   If users still do not appear, check Firestore Rules are deployed');
    console.log('   and that the student doc exists at branches/bordj_menaiel/users/{uid}.');
  } else {
    console.log(`Found ${problemsFound} problem(s).`);
    if (!APPLY_FIX) {
      console.log('Run with --fix to repair them:');
      console.log('  node scripts/fix-admin-branch.js --fix');
    }
  }
}

main().catch(err => { console.error('Script failed:', err); process.exit(1); });
