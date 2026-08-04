/**
 * Backfill `startMonth` on existing SUPPORT classes (Group Start Month feature).
 *
 * A support class now carries `startMonth` ('YYYY-MM') — the month the group
 * officially begins, which drives the reservation lifecycle. Classes created
 * before this feature have none. This script sets `startMonth = <current month>`
 * on every support class that lacks a valid one, across both branches, so they
 * keep behaving exactly as before: startMonth <= current month ⇒ no student is
 * ever reserved (identical to the pre-feature flow).
 *
 * IDEMPOTENT — a class that already has a valid 'YYYY-MM' startMonth is skipped,
 * so re-running is a no-op. Languages/trainings are never touched (startMonth is
 * support-only). Existing registrations need no backfill: their windows are
 * already snapshotted, and derived reserved-ness is false for a past start month.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-group-start-month.js --dry-run   # compute + print, write nothing
 *   node scripts/migrate-group-start-month.js             # apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db } = require('../config/firebase');
const { currentMonthKey, normalizeMonthKey } = require('../services/reservationService');

const DRY_RUN  = process.argv.includes('--dry-run');
const BRANCHES = ['boumerdes', 'bordj_menaiel'];
const START_MONTH = currentMonthKey(new Date());

async function migrateBranch(branchId) {
  const snap = await db.collection('branches').doc(branchId).collection('classes')
    .where('serviceType', '==', 'support').get();

  let total = 0; let backfilled = 0; let alreadyOk = 0;
  let batch = db.batch();
  let pending = 0;

  for (const docSnap of snap.docs) {
    total += 1;
    const c = docSnap.data() || {};
    if (normalizeMonthKey(c.startMonth)) { alreadyOk += 1; continue; }

    backfilled += 1;
    if (!DRY_RUN) {
      batch.update(docSnap.ref, {
        startMonth: START_MONTH,
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
  console.log(`\nGroup Start Month migration → set startMonth=${START_MONTH} ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}\n`);
  const totals = { total: 0, backfilled: 0, alreadyOk: 0 };
  for (const b of BRANCHES) {
    const r = await migrateBranch(b);
    totals.total += r.total; totals.backfilled += r.backfilled; totals.alreadyOk += r.alreadyOk;
  }
  console.log(`\nDone. total support classes=${totals.total}, backfilled=${totals.backfilled}, already ok=${totals.alreadyOk}`);
  if (DRY_RUN) console.log('Re-run without --dry-run to apply.');
  process.exit(0);
})().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
