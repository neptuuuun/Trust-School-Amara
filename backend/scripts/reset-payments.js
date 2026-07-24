/**
 * reset-payments.js — PRODUCTION PAYMENT RESET (DATA ONLY)
 * =========================================================
 * Brings the database to a clean state that behaves as if NO payment has ever
 * been made, WITHOUT touching any Chargily integration / webhook / checkout code
 * (this script removes data only — it never edits payment logic).
 *
 * WHAT IT DOES  (discovered from the codebase, not assumed):
 *
 *   DELETE every document in ─────────────────────────────────────────────────
 *     • paymentOrders                       (top-level)  Chargily + cash orders
 *     • ledger                              (top-level)  all revenue entries
 *     • supportLessonRegistrations          (top-level)  paid support enrollments
 *     • branches/{b}/annualPayments                      annual-fee payments
 *     • branches/{b}/annualFeeRegistered                 archived annual fees
 *     • branches/{b}/payments                            legacy per-student payments
 *     • branches/{b}/languagesRegistered                 paid language enrollments
 *     • branches/{b}/trainingsRegistered                 paid training enrollments
 *     • branches/{b}/languagesForms/<uid>/languageFormEntries  (student mirrors)
 *     • branches/{b}/trainingsForms/<uid>/trainingFormEntries  (student mirrors)
 *
 *   RESET FIELDS (documents kept) ────────────────────────────────────────────
 *     • branches/{b}/users     yearlyFeePaid/annualFeePaid/paymentVerified → false
 *                              delete annualFeeYear, annualFeePaymentId
 *                              clear registrations.{language,languages,trainings,support}
 *     • branches/{b}/classes   enrollmentCount → 0
 *
 *   PRESERVED (never touched) ─────────────────────────────────────────────────
 *     auditLogs, config/finance, branches, users (records), classes (except the
 *     counter), all catalogs, admins, owners, notifications, announcements,
 *     branches/{b}/registrations. Owner/Overview dashboards derive revenue from
 *     `ledger` at read time, so they reset automatically once it is emptied.
 *
 * SAFETY:
 *   • DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *   • Idempotent — safe to re-run.
 *   • Recommended: take a Firestore export/backup BEFORE running with --apply.
 *
 * USAGE:
 *   cd backend
 *   node scripts/reset-payments.js                 # dry-run: report only, writes nothing
 *   node scripts/reset-payments.js --apply         # PERFORM the reset
 *   node scripts/reset-payments.js --apply --yes    # skip the 5s confirmation delay
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db } = require('../config/firebase');

const APPLY = process.argv.includes('--apply');
const SKIP_CONFIRM = process.argv.includes('--yes');
const FieldValue = admin.firestore.FieldValue;

// Branch ids used across the codebase (backfill-ledger.js, auditSchedules.js …).
// Also auto-discovered below so a new branch is never silently missed.
const KNOWN_BRANCHES = ['boumerdes', 'bordj_menaiel'];

const tally = {}; // { label: count }
function count(label, n = 1) { tally[label] = (tally[label] || 0) + n; }

const log = (...a) => console.log(...a);
const mode = () => (APPLY ? 'APPLY' : 'DRY-RUN');

// ── Deletion helpers ──────────────────────────────────────────────────────────

/** Delete every doc a query/collection ref yields, in batches of 450. Returns count. */
async function deleteAllDocs(collRef, label) {
  let deleted = 0;
  while (true) {
    const snap = await collRef.limit(450).get();
    if (snap.empty) break;
    if (APPLY) {
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    deleted += snap.size;
    // In dry-run we must not loop forever on the same (undeleted) page.
    if (!APPLY) { deleted = snap.size < 450 ? deleted : await countAll(collRef); break; }
  }
  if (deleted) { count(label, deleted); log(`  [${mode()}] delete ${deleted.toString().padStart(5)}  ${label}`); }
  return deleted;
}

/** Count all docs (dry-run reporting) without loading them all into one page. */
async function countAll(collRef) {
  try {
    const agg = await collRef.count().get();
    return agg.data().count;
  } catch {
    // Fallback: page through ids only.
    let total = 0, last = null;
    while (true) {
      let q = collRef.orderBy(admin.firestore.FieldPath.documentId()).limit(500);
      if (last) q = q.startAfter(last);
      const s = await q.get();
      if (s.empty) break;
      total += s.size; last = s.docs[s.docs.length - 1];
      if (s.size < 500) break;
    }
    return total;
  }
}

// ── Steps ───────────────────────────────────────────────────────────────────

async function discoverBranches() {
  const set = new Set(KNOWN_BRANCHES);
  try {
    const snap = await db.collection('branches').get();
    snap.docs.forEach((d) => set.add(d.id));
  } catch (e) { log('  (could not list branches, using known list):', e.message); }
  return [...set];
}

async function resetTopLevel() {
  log(`\n▸ Top-level payment collections`);
  await deleteAllDocs(db.collection('paymentOrders'), 'paymentOrders');
  await deleteAllDocs(db.collection('ledger'), 'ledger');
  await deleteAllDocs(db.collection('supportLessonRegistrations'), 'supportLessonRegistrations');
}

async function resetBranchCollections(branchId) {
  const b = db.collection('branches').doc(branchId);
  log(`\n▸ branch «${branchId}» — payment/enrollment collections`);
  await deleteAllDocs(b.collection('annualPayments'), `${branchId}/annualPayments`);
  await deleteAllDocs(b.collection('annualFeeRegistered'), `${branchId}/annualFeeRegistered`);
  await deleteAllDocs(b.collection('payments'), `${branchId}/payments`);
  await deleteAllDocs(b.collection('languagesRegistered'), `${branchId}/languagesRegistered`);
  await deleteAllDocs(b.collection('trainingsRegistered'), `${branchId}/trainingsRegistered`);

  // Student form mirrors: container doc + a *FormEntries subcollection each.
  for (const [container, sub] of [
    ['languagesForms', 'languageFormEntries'],
    ['trainingsForms', 'trainingFormEntries'],
  ]) {
    const containers = await b.collection(container).get();
    let entries = 0;
    for (const doc of containers.docs) {
      entries += await deleteAllDocs(doc.ref.collection(sub), `${branchId}/${container}/*/${sub}`);
    }
    if (!entries) log(`  [${mode()}] delete     0  ${branchId}/${container}/*/${sub}`);
  }
}

async function resetUserFlags(branchId) {
  const usersRef = db.collection('branches').doc(branchId).collection('users');
  const snap = await usersRef.get();
  log(`\n▸ branch «${branchId}» — reset payment flags on ${snap.size} users`);
  let touched = 0;
  let batch = db.batch(); let inBatch = 0;
  for (const doc of snap.docs) {
    const patch = {
      yearlyFeePaid: false,
      annualFeePaid: false,
      paymentVerified: false,
      annualFeeYear: FieldValue.delete(),
      annualFeePaymentId: FieldValue.delete(),
      // Enrollment summary maps point at now-deleted enrollments — clear them.
      'registrations.language': false,
      'registrations.languages': [],
      'registrations.trainings': [],
      'registrations.support': [],
      updatedAt: FieldValue.serverTimestamp(),
    };
    touched += 1;
    if (APPLY) {
      batch.set(doc.ref, patch, { merge: true });
      if (++inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
  }
  if (APPLY && inBatch) await batch.commit();
  count(`${branchId}/users (flags reset)`, touched);
  log(`  [${mode()}] reset ${touched.toString().padStart(6)}  ${branchId}/users payment flags`);
}

async function resetEnrollmentCounts(branchId) {
  const classesRef = db.collection('branches').doc(branchId).collection('classes');
  const snap = await classesRef.get();
  let touched = 0;
  let batch = db.batch(); let inBatch = 0;
  for (const doc of snap.docs) {
    if ((doc.data() || {}).enrollmentCount === 0) continue;
    touched += 1;
    if (APPLY) {
      batch.update(doc.ref, { enrollmentCount: 0, updatedAt: FieldValue.serverTimestamp() });
      if (++inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
  }
  if (APPLY && inBatch) await batch.commit();
  count(`${branchId}/classes (enrollmentCount→0)`, touched);
  log(`  [${mode()}] reset ${touched.toString().padStart(6)}  ${branchId}/classes enrollmentCount→0`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  log('='.repeat(72));
  log(`  PAYMENT RESET — mode: ${mode()}${APPLY ? '  ⚠️  THIS WILL DELETE DATA' : '  (no writes)'}`);
  log('='.repeat(72));

  if (APPLY && !SKIP_CONFIRM) {
    log('\n⚠️  Starting in 5 seconds. Ctrl-C to abort. (pass --yes to skip)');
    await new Promise((r) => setTimeout(r, 5000));
  }

  const branches = await discoverBranches();
  log(`\nBranches: ${branches.join(', ')}`);

  await resetTopLevel();
  for (const branchId of branches) {
    await resetBranchCollections(branchId);
    await resetUserFlags(branchId);
    await resetEnrollmentCounts(branchId);
  }

  log('\n' + '='.repeat(72));
  log(`  SUMMARY (${mode()})`);
  log('='.repeat(72));
  const keys = Object.keys(tally).sort();
  if (!keys.length) log('  Nothing to do — already clean.');
  keys.forEach((k) => log(`  ${String(tally[k]).padStart(7)}  ${k}`));
  log('');
  if (!APPLY) log('  DRY-RUN only. Re-run with --apply to perform the reset.\n');
  else        log('  ✅ Reset applied. Run verify-payments-reset.js to confirm.\n');

  process.exit(0);
})().catch((e) => { console.error('\n❌ reset-payments failed:', e); process.exit(1); });
