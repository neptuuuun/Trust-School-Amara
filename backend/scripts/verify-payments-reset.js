/**
 * verify-payments-reset.js — POST-RESET VERIFICATION (read-only)
 * ==============================================================
 * Confirms the database is in the clean state required after reset-payments.js.
 * Writes NOTHING. Prints a PASS/FAIL checklist mapping to the reset requirements:
 *
 *   ✔ No payment documents remain
 *       paymentOrders, ledger, supportLessonRegistrations,
 *       branches/{b}/{annualPayments,annualFeeRegistered,payments,
 *                      languagesRegistered,trainingsRegistered} all empty,
 *       and no *Forms/*FormEntries remain.
 *   ✔ Every student appears unpaid
 *       no user has yearlyFeePaid/annualFeePaid/paymentVerified === true.
 *   ✔ Annual fees unpaid            (annualPayments empty — checked above).
 *   ✔ Support/language/training require payment again
 *       enrollment collections empty → duplicate-guard won't block a fresh
 *       checkout, and classes.enrollmentCount is 0.
 *
 * USAGE:
 *   cd backend
 *   node scripts/verify-payments-reset.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db } = require('../config/firebase');

const KNOWN_BRANCHES = ['boumerdes', 'bordj_menaiel'];
let failures = 0;

async function size(collRef) {
  try { return (await collRef.count().get()).data().count; }
  catch { return (await collRef.get()).size; }
}

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

async function discoverBranches() {
  const set = new Set(KNOWN_BRANCHES);
  try { (await db.collection('branches').get()).docs.forEach((d) => set.add(d.id)); } catch {}
  return [...set];
}

(async () => {
  console.log('='.repeat(72));
  console.log('  PAYMENT RESET VERIFICATION (read-only)');
  console.log('='.repeat(72));

  console.log('\n▸ No payment documents remain');
  check('paymentOrders empty', (await size(db.collection('paymentOrders'))) === 0);
  check('ledger empty', (await size(db.collection('ledger'))) === 0);
  check('supportLessonRegistrations empty', (await size(db.collection('supportLessonRegistrations'))) === 0);

  const branches = await discoverBranches();
  for (const b of branches) {
    const ref = db.collection('branches').doc(b);
    for (const c of ['annualPayments', 'annualFeeRegistered', 'payments', 'languagesRegistered', 'trainingsRegistered']) {
      check(`${b}/${c} empty`, (await size(ref.collection(c))) === 0);
    }
    // Form mirrors.
    for (const [container, sub] of [['languagesForms', 'languageFormEntries'], ['trainingsForms', 'trainingFormEntries']]) {
      let entries = 0;
      for (const doc of (await ref.collection(container).get()).docs) {
        entries += await size(doc.ref.collection(sub));
      }
      check(`${b}/${container}/*/${sub} empty`, entries === 0, entries ? `${entries} left` : '');
    }
  }

  console.log('\n▸ Every student appears unpaid');
  for (const b of branches) {
    const users = await db.collection('branches').doc(b).collection('users').get();
    const paid = users.docs.filter((d) => {
      const u = d.data() || {};
      return u.yearlyFeePaid === true || u.annualFeePaid === true || u.paymentVerified === true;
    });
    check(`${b}: no user flagged paid`, paid.length === 0,
      paid.length ? `${paid.length} still paid (e.g. ${paid[0].id})` : `${users.size} users clean`);
  }

  console.log('\n▸ Enrollment counters cleared');
  for (const b of branches) {
    const classes = await db.collection('branches').doc(b).collection('classes').get();
    const nonZero = classes.docs.filter((d) => Number((d.data() || {}).enrollmentCount || 0) !== 0);
    check(`${b}: all classes enrollmentCount=0`, nonZero.length === 0,
      nonZero.length ? `${nonZero.length} non-zero (e.g. ${nonZero[0].id})` : `${classes.size} classes`);
  }

  console.log('\n' + '='.repeat(72));
  console.log(failures === 0
    ? '  ✅ ALL CHECKS PASSED — clean state. Next real Chargily payment behaves as the first.'
    : `  ❌ ${failures} CHECK(S) FAILED — see above.`);
  console.log('='.repeat(72) + '\n');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('\n❌ verify failed:', e); process.exit(1); });
