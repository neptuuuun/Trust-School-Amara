/**
 * Repair annual-fee records whose `academicYear` was mis-stamped with a GRADE.
 * ---------------------------------------------------------------------------
 * The admin manual-recording path used to write the student's grade (e.g. "sec3")
 * into the `annualPayments` doc's `academicYear` field instead of the "YYYY-YYYY"
 * label. Every reader filters on `academicYear` as a year label, so those records
 * were invisible in the admin list, zeroed the dashboard stats, and showed the
 * student as UNPAID — even though the payment, flags, and ledger were all written.
 *
 * The correct label was ALWAYS stored alongside it in the `year` field, so this
 * repair simply copies `year` → `academicYear` for the affected docs. It is a pure
 * field correction:
 *   • NEVER creates, deletes, or duplicates a payment.
 *   • NEVER changes the amount, status, or any other field.
 *   • Only rewrites `academicYear`, and only when it is currently NOT a valid label.
 *
 * SAFE BY DEFAULT — dry-run unless `--apply` is passed. Idempotent: a doc whose
 * `academicYear` is already a valid "YYYY-YYYY" label is skipped, so re-running
 * doubles as verification (second run should report fixed=0). A doc whose `year`
 * is ALSO not a usable label is LEFT UNTOUCHED and printed for manual review —
 * never guessed.
 *
 * Usage:
 *   cd backend
 *   node scripts/fix-annual-fee-academic-year.js            # dry-run (report only)
 *   node scripts/fix-annual-fee-academic-year.js --apply    # write the fix
 *   node scripts/fix-annual-fee-academic-year.js            # re-run to VERIFY (expect fixed=0)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db } = require('../config/firebase');
const ay = require('../services/academicYear');

const APPLY = process.argv.includes('--apply');
const BRANCHES = ['boumerdes', 'bordj_menaiel'];

const isLabel = (v) => Boolean(ay.parseAcademicYearLabel(v));

async function repairBranch(branchId) {
  const colRef = db.collection('branches').doc(branchId).collection('annualPayments');
  const snap = await colRef.get();

  let total = 0, already = 0, fixed = 0, manualReview = 0;
  const reviewList = [];
  let batch = db.batch();
  let pending = 0;

  for (const docSnap of snap.docs) {
    total += 1;
    const data = docSnap.data() || {};
    const currentAY = data.academicYear;

    // Already correct (or any valid label) → nothing to do. Idempotent.
    if (isLabel(currentAY)) { already += 1; continue; }

    // The authoritative label lives in `year`. Only fix when it is usable.
    if (isLabel(data.year)) {
      fixed += 1;
      console.log(
        `  FIX  ${docSnap.ref.path}\n` +
        `       academicYear: ${JSON.stringify(currentAY)} → ${JSON.stringify(data.year)}` +
        (data.studyYear || data.level ? `  (grade already in studyYear/level: ${data.studyYear || data.level})` : '')
      );
      if (APPLY) {
        batch.update(docSnap.ref, { academicYear: data.year });
        pending += 1;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
    } else {
      // Can't derive a safe label → never guess. Flag for a human.
      manualReview += 1;
      reviewList.push({ path: docSnap.ref.path, academicYear: currentAY, year: data.year, status: data.status });
    }
  }

  if (APPLY && pending > 0) await batch.commit();

  console.log(
    `\n[${branchId}] total=${total}  alreadyValid=${already}  ` +
    `${APPLY ? 'fixed' : 'wouldFix'}=${fixed}  manualReview=${manualReview}`
  );
  if (reviewList.length) {
    console.log(`  ⚠ manual review (no usable \`year\` label — left untouched):`);
    reviewList.forEach((r) => console.log(`     ${r.path}  year=${JSON.stringify(r.year)} academicYear=${JSON.stringify(r.academicYear)} status=${r.status}`));
  }
  return { total, already, fixed, manualReview };
}

(async () => {
  console.log(APPLY ? '=== APPLYING annual-fee academicYear repair ===' : '=== DRY-RUN (no writes) — pass --apply to write ===');
  const totals = { total: 0, already: 0, fixed: 0, manualReview: 0 };
  for (const b of BRANCHES) {
    console.log(`\n── Branch: ${b} ──`);
    const r = await repairBranch(b);
    totals.total += r.total; totals.already += r.already; totals.fixed += r.fixed; totals.manualReview += r.manualReview;
  }
  console.log(
    `\n=== SUMMARY === total=${totals.total}  alreadyValid=${totals.already}  ` +
    `${APPLY ? 'fixed' : 'wouldFix'}=${totals.fixed}  manualReview=${totals.manualReview}`
  );
  if (!APPLY && totals.fixed > 0) console.log('Re-run with --apply to write these corrections.');
  process.exit(0);
})().catch((e) => { console.error('Repair failed:', e); process.exit(1); });
