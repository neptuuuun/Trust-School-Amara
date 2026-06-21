/**
 * Migrate existing admins/{uid} documents to the multi-admin schema.
 *
 * Backfills the fields the foundation relies on, WITHOUT changing branch
 * assignments or roles. Idempotent and safe to re-run.
 *
 *   uid         → set to the document id (so the field mirrors the key)
 *   name        → kept if present; otherwise derived from the email local-part
 *                 (a placeholder the owner should later replace with the real name)
 *   branchName  → derived from branchId when missing
 *   active      → defaults to true when missing (never overwrites an explicit false)
 *   role        → defaults to 'admin' when missing
 *
 * Also repairs the legacy branchId typo 'bordj_mnaiel' → 'bordj_menaiel'.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-admin-schema.js          # dry-run (read-only)
 *   node scripts/migrate-admin-schema.js --fix    # apply changes
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { admin, db } = require('../config/firebase');

const APPLY = process.argv.includes('--fix');

const TYPO    = 'bordj_mnaiel';
const CORRECT = 'bordj_menaiel';

const BRANCH_NAMES = {
  boumerdes:     'بومرداس',
  bordj_menaiel: 'برج منايل',
};

// Best-effort display name from an email when the doc has none yet.
function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Admin';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Admin';
}

async function main() {
  console.log('\n=== Admin schema migration ===');
  console.log('Mode:', APPLY ? 'FIX (writes to Firestore)' : 'DRY-RUN (read-only)\n');

  const snap = await db.collection('admins').get();
  if (snap.empty) {
    console.log('No documents in the admins collection.');
    return;
  }

  let changed = 0;

  for (const docSnap of snap.docs) {
    const uid  = docSnap.id;
    const data = docSnap.data() || {};
    const patch = {};

    if (data.uid !== uid) patch.uid = uid;

    let branchId = data.branchId;
    if (branchId === TYPO) { branchId = CORRECT; patch.branchId = CORRECT; }

    if (!data.name) patch.name = nameFromEmail(data.email);
    if (!data.branchName && branchId && BRANCH_NAMES[branchId]) patch.branchName = BRANCH_NAMES[branchId];
    if (data.active === undefined) patch.active = true;
    if (!data.role) patch.role = 'admin';

    if (Object.keys(patch).length === 0) {
      console.log(`admins/${uid}: already up to date.`);
      continue;
    }

    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    changed++;
    console.log(`admins/${uid}: ${APPLY ? 'updating' : 'would update'} →`, JSON.stringify(patch));
    if (APPLY) await db.collection('admins').doc(uid).set(patch, { merge: true });
  }

  console.log(`\n${changed} document(s) ${APPLY ? 'updated' : 'need updating'}.`);
  if (!APPLY && changed > 0) console.log('Re-run with --fix to apply.');
}

main().catch((err) => { console.error('Migration failed:', err); process.exit(1); });
