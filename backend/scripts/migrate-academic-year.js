/**
 * Backfill `academicYear` ("YYYY-YYYY") on existing academic records.
 * ------------------------------------------------------------------
 * The automatic academic-year system stamps `academicYear` on every new academic
 * write. Records created before it lack the field; this script backfills them so
 * the current-year filters (and the server-side archive queries) return them.
 *
 * DERIVATION (deliberately per-record-kind):
 *   • classes/groups  → from `startMonth` ONLY. NEVER `createdAt`: a school may
 *     prepare next year's groups before 1 July, so createdAt is misleading. A
 *     group with no academicYear AND no usable startMonth is LEFT UNTOUCHED and
 *     printed in the `manual-review` list for an admin to resolve — never guessed.
 *   • registrations / payments / form entries → from the record's own date
 *     (registeredAt / verifiedAt / startDate / submittedAt / createdAt). A
 *     registration's date reliably reflects its academic year.
 *
 * SAFE BY DEFAULT: dry-run unless `--apply` is passed. Idempotent — a record that
 * already has `academicYear` is skipped, so re-running (or running after --apply)
 * doubles as verification: the second run should report backfilled=0 everywhere
 * except the manual-review groups. Nothing is ever deleted or overwritten.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-academic-year.js            # dry-run (compute + print, no writes)
 *   node scripts/migrate-academic-year.js --apply    # write the backfill
 *   node scripts/migrate-academic-year.js            # re-run to VERIFY (expect 0 backfills)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db } = require('../config/firebase');
const ay = require('../services/academicYear');

const APPLY    = process.argv.includes('--apply');
const BRANCHES = ['boumerdes', 'bordj_menaiel'];

/** Derive an academic-year label from the first present date field, else null. */
function deriveLabel(data, fields) {
  for (const f of fields) {
    const v = data[f];
    if (v === null || v === undefined || v === '') continue;
    const d = ay.coerceDateField(v);
    if (d) return ay.getAcademicYearLabel(d);
  }
  return null;
}

/**
 * Backfill a set of docs. `deriveFields` are tried in order. When `isClass`, a
 * doc with no derivable year is recorded for manual review instead of guessed.
 */
async function backfillDocs(label, docs, deriveFields, { isClass = false } = {}) {
  let total = 0, already = 0, backfilled = 0, unresolved = 0;
  const manualReview = [];
  let batch = db.batch();
  let pending = 0;

  for (const docSnap of docs) {
    total += 1;
    const data = docSnap.data() || {};
    if (data.academicYear) { already += 1; continue; }

    const yr = deriveLabel(data, deriveFields);
    if (!yr) {
      unresolved += 1;
      if (isClass) {
        manualReview.push({
          path: docSnap.ref.path,
          group: data.groupName || data.subjectName || data.name || '(بدون اسم)',
          serviceType: data.serviceType || '?',
        });
      }
      continue;
    }

    backfilled += 1;
    if (APPLY) {
      batch.update(docSnap.ref, {
        academicYear: yr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      pending += 1;
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }

  if (APPLY && pending > 0) await batch.commit();

  console.log(`  ${label}: total=${total}, already=${already}, backfilled=${backfilled}, unresolved=${unresolved}`);
  return { total, already, backfilled, unresolved, manualReview };
}

async function migrateBranch(branchId) {
  console.log(`\n▸ Branch: ${branchId}`);
  const branchRef = db.collection('branches').doc(branchId);
  const manualReview = [];

  // Classes — startMonth ONLY (see header). Ambiguous groups → manual review.
  const classesSnap = await branchRef.collection('classes').get();
  const cls = await backfillDocs('classes', classesSnap.docs, ['startMonth'], { isClass: true });
  manualReview.push(...cls.manualReview);

  // Language / training registration archives.
  const langSnap = await branchRef.collection('languagesRegistered').get();
  await backfillDocs('languagesRegistered', langSnap.docs, ['registeredAt', 'verifiedAt', 'createdAt']);

  const trainSnap = await branchRef.collection('trainingsRegistered').get();
  await backfillDocs('trainingsRegistered', trainSnap.docs, ['registeredAt', 'verifiedAt', 'createdAt']);

  // Student-submitted form entries (collection-group, scoped to this branch).
  const langForms = await db.collectionGroup('languageFormEntries').where('branchId', '==', branchId).get();
  await backfillDocs('languageFormEntries', langForms.docs, ['submittedAt', 'verifiedAt', 'createdAt']);

  const trainForms = await db.collectionGroup('trainingFormEntries').where('branchId', '==', branchId).get();
  await backfillDocs('trainingFormEntries', trainForms.docs, ['submittedAt', 'verifiedAt', 'createdAt']);

  // Annual payments (already stamped going forward; repair any legacy gaps).
  const feesSnap = await branchRef.collection('annualPayments').get();
  await backfillDocs('annualPayments', feesSnap.docs, ['verifiedAt', 'createdAt']);

  // Support registrations live in a single GLOBAL collection, keyed by branchId.
  const supportSnap = await db.collection('supportLessonRegistrations').where('branchId', '==', branchId).get();
  await backfillDocs('supportLessonRegistrations', supportSnap.docs, ['startDate', 'createdAt']);

  return { manualReview };
}

(async () => {
  console.log(`\nAcademic-year backfill ${APPLY ? '(LIVE — writing)' : '(DRY RUN — no writes; pass --apply to write)'}`);
  const allManualReview = [];
  for (const b of BRANCHES) {
    const { manualReview } = await migrateBranch(b);
    allManualReview.push(...manualReview);
  }

  if (allManualReview.length) {
    console.log(`\n⚠ MANUAL REVIEW — ${allManualReview.length} group(s) have no academicYear and no usable startMonth.`);
    console.log('  Set startMonth (or academicYear) on these from the admin catalog; they are NOT auto-assigned:');
    allManualReview.forEach((m) => console.log(`   • [${m.serviceType}] ${m.group}  (${m.path})`));
  } else {
    console.log('\n✓ No groups need manual review.');
  }

  console.log(`\nDone.${APPLY ? '' : ' Re-run with --apply to write. Run again afterwards (no flag) to verify 0 backfills remain.'}`);
  process.exit(0);
})().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
