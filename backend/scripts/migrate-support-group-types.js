/**
 * Migrate existing support classes to the new groupType field.
 *
 * The support-level system adds a `groupType` to support groups
 * (branches/{b}/classes, serviceType:'support'):
 *   'normal_support'     — regular group (default)
 *   'low_level_support'  — dedicated group for weaker students
 *
 * Classes created before this feature have no `groupType`. This script backfills
 * `groupType:'normal_support'` on every support class that lacks it, across both
 * branches. It is IDEMPOTENT — a class that already has a (valid) groupType is
 * skipped, so re-running is a no-op. Languages/trainings are never touched.
 *
 * Student averages are NOT migrated: a student with no stored average is simply
 * prompted (once) on their next support enrollment — there is no destructive write.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-support-group-types.js --dry-run   # compute + print, write nothing
 *   node scripts/migrate-support-group-types.js             # apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db } = require('../config/firebase');
const { GROUP_TYPES, DEFAULT_GROUP_TYPE } = require('../services/supportEligibility');

const DRY_RUN  = process.argv.includes('--dry-run');
const BRANCHES = ['boumerdes', 'bordj_menaiel'];

async function migrateBranch(branchId) {
  const snap = await db.collection('branches').doc(branchId).collection('classes')
    .where('serviceType', '==', 'support').get();

  let total = 0; let backfilled = 0; let alreadyOk = 0;
  let batch = db.batch();
  let pending = 0;

  for (const docSnap of snap.docs) {
    total += 1;
    const c = docSnap.data() || {};
    if (GROUP_TYPES.includes(c.groupType)) { alreadyOk += 1; continue; }

    backfilled += 1;
    if (!DRY_RUN) {
      batch.update(docSnap.ref, {
        groupType: DEFAULT_GROUP_TYPE,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      pending += 1;
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }

  if (!DRY_RUN && pending > 0) await batch.commit();

  console.log(`  ${branchId}: support classes=${total}, backfilled=${backfilled}, already ok=${alreadyOk}`);
  return { total, backfilled, alreadyOk };
}

(async () => {
  console.log(`\nSupport group-type migration ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}\n`);
  const totals = { total: 0, backfilled: 0, alreadyOk: 0 };
  for (const b of BRANCHES) {
    const r = await migrateBranch(b);
    totals.total += r.total; totals.backfilled += r.backfilled; totals.alreadyOk += r.alreadyOk;
  }
  console.log(`\nDone. total support classes=${totals.total}, backfilled=${totals.backfilled}, already ok=${totals.alreadyOk}`);
  if (DRY_RUN) console.log('Re-run without --dry-run to apply.');
  process.exit(0);
})().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
