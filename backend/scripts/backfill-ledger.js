/**
 * Backfill the financial ledger from existing verified-payment records.
 *
 * The ledger (single source of truth for revenue) is normally appended to live
 * when an admin verifies a payment. This script reconstructs HISTORY from the
 * records that predate the ledger, across both branches, writing idempotent
 * entries whose ids match the live recording scheme — so it is safe to re-run and
 * never double-counts against live writes.
 *
 * Sources & how revenue is derived (mirrors the live wiring):
 *   • annualPayments (status verified)        → serviceType 'annualFee'  (amount|annualFee)
 *   • languagesRegistered (approved archive)  → serviceType 'language'   (languagePrice|price|levelPrice|class.price)
 *   • trainingsRegistered (approved archive)  → serviceType 'training'   (trainingPrice|price|class.price)
 *   • supportLessonRegistrations (verified,     → serviceType 'support'    (totalPrice|proratedAmount|monthlyPrice)
 *       source != 'annualFee', amount > 0)
 *
 * Known limitation: a support registration document reflects only its CURRENT
 * billing cycle, so past monthly renewals cannot be reconstructed from history —
 * only the latest cycle is backfilled. Going forward every cycle is recorded live.
 *
 * Usage:
 *   cd backend
 *   node scripts/backfill-ledger.js --dry-run     # compute + print, write nothing
 *   node scripts/backfill-ledger.js               # write entries
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db } = require('../config/firebase');
const ledger = require('../services/ledgerService');
const { registrationPayable } = require('../services/sessionService');

const DRY_RUN  = process.argv.includes('--dry-run');
const BRANCHES = ['boumerdes', 'bordj_menaiel'];
const SYSTEM   = { role: 'system', via: 'backfill' };

const tally = {}; // { [branch]: { [serviceType]: { count, total } } }
function record(branch, serviceType, amount) {
  tally[branch] = tally[branch] || {};
  tally[branch][serviceType] = tally[branch][serviceType] || { count: 0, total: 0 };
  tally[branch][serviceType].count += 1;
  tally[branch][serviceType].total += ledger.toNumber(amount);
}

async function loadClassCache(branchId) {
  const cache = new Map();
  const snap = await db.collection('branches').doc(branchId).collection('classes').get();
  snap.docs.forEach((d) => cache.set(d.id, { id: d.id, ...d.data() }));
  return cache;
}

function status(d) { return String(d.status || '').toLowerCase(); }

async function write(entry) {
  if (DRY_RUN) return;
  await ledger.recordPayment({ ...entry, recordedBy: SYSTEM });
}

async function backfillBranch(branchId) {
  const classes = await loadClassCache(branchId);
  const enrich = (data) => {
    const cls = data.classId ? classes.get(data.classId) : null;
    return {
      subjectId:   data.subjectId   || (cls && cls.subjectId)   || null,
      subjectName: data.subjectName || data.languageName || data.trainingTitle || data.trainingName || (cls && cls.subjectName) || null,
      className:   data.groupName   || data.levelLabel || (cls && (cls.groupName || cls.name)) || null,
      teacherId:   data.teacherId   || (cls && cls.teacherId)   || null,
      teacherName: data.teacherName || (cls && cls.teacherName) || null,
      classPrice:  cls ? (cls.price ?? cls.monthlyPrice) : null,
    };
  };

  // ── annualFee ────────────────────────────────────────────────────────────
  const annual = await db.collection('branches').doc(branchId).collection('annualPayments')
    .where('status', '==', 'verified').get();
  for (const d of annual.docs) {
    const data = d.data() || {};
    const amount = ledger.toNumber(data.amount ?? data.annualFee);
    if (amount <= 0) continue;
    const paidAt = data.verifiedAt || data.createdAt || null;
    await write({
      branchId, studentId: data.userId || null, studentName: data.userName || data.studentName || null,
      serviceType: 'annualFee', amount,
      period: data.academicYear || ledger.academicYearLabel(ledger.toDate(paidAt) || new Date()),
      sourceCollection: 'annualPayments', sourceDocId: d.id, paidAt,
    });
    record(branchId, 'annualFee', amount);
  }

  // ── language (approved archive) ────────────────────────────────────────────
  const langs = await db.collection('branches').doc(branchId).collection('languagesRegistered').get();
  for (const d of langs.docs) {
    const data = d.data() || {};
    const e = enrich(data);
    const amount = ledger.toNumber(data.languagePrice ?? data.price ?? data.levelPrice ?? e.classPrice);
    if (amount <= 0) continue;
    const paidAt = data.registeredAt || data.verifiedAt || null;
    await write({
      branchId, studentId: data.userId || null, studentName: data.studentName || data.userName || null,
      serviceType: 'language', amount,
      subjectId: e.subjectId, subjectName: e.subjectName, classId: data.classId || null,
      className: e.className, teacherId: e.teacherId, teacherName: e.teacherName,
      period: ledger.academicYearLabel(ledger.toDate(paidAt) || new Date()),
      sourceCollection: 'languagesRegistered', sourceDocId: d.id, paidAt,
    });
    record(branchId, 'language', amount);
  }

  // ── training (approved archive) ────────────────────────────────────────────
  const trainings = await db.collection('branches').doc(branchId).collection('trainingsRegistered').get();
  for (const d of trainings.docs) {
    const data = d.data() || {};
    const e = enrich(data);
    const amount = ledger.toNumber(data.trainingPrice ?? data.price ?? e.classPrice);
    if (amount <= 0) continue;
    const paidAt = data.registeredAt || data.verifiedAt || null;
    await write({
      branchId, studentId: data.userId || null, studentName: data.studentName || data.userName || null,
      serviceType: 'training', amount,
      subjectId: e.subjectId, subjectName: e.subjectName, classId: data.classId || null,
      className: e.className, teacherId: e.teacherId, teacherName: e.teacherName,
      period: ledger.academicYearLabel(ledger.toDate(paidAt) || new Date()),
      sourceCollection: 'trainingsRegistered', sourceDocId: d.id, paidAt,
    });
    record(branchId, 'training', amount);
  }

  // ── support (monthly subscriptions; exclude free annual-fee bundles) ───────
  const support = await db.collection('supportLessonRegistrations')
    .where('branchId', '==', branchId).where('status', '==', 'verified').get();
  for (const d of support.docs) {
    const data = d.data() || {};
    if (String(data.source || '').toLowerCase() === 'annualfee') continue; // free bundled access
    const amount = registrationPayable(data); // same stored payable amount analytics reads
    if (amount <= 0) continue;
    const e = enrich(data);
    const paidAt = data.verifiedAt || data.startDate || data.createdAt || null;
    const monthKey = data.cycleMonthKey || ledger.monthKey(ledger.toDate(paidAt) || new Date());
    await write({
      branchId, studentId: data.userId || null, studentName: data.userName || data.studentName || null,
      serviceType: 'support', amount,
      subjectId: e.subjectId, subjectName: e.subjectName || data.lessonName, classId: data.classId || data.lessonId || null,
      className: e.className, teacherId: e.teacherId, teacherName: e.teacherName,
      period: monthKey,
      sourceCollection: 'supportLessonRegistrations', sourceDocId: `${d.id}_${monthKey}`, paidAt,
    });
    record(branchId, 'support', amount);
  }
}

async function main() {
  console.log(`\n=== Backfill ledger ===  mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (writing)'}\n`);
  for (const b of BRANCHES) {
    console.log(`— Branch: ${b}`);
    await backfillBranch(b);
  }

  console.log('\n=== Summary ===');
  let grand = 0;
  for (const b of BRANCHES) {
    console.log(`\n${b}:`);
    const byType = tally[b] || {};
    let branchTotal = 0;
    for (const [st, v] of Object.entries(byType)) {
      console.log(`  ${st.padEnd(10)} ${String(v.count).padStart(5)} entries   ${v.total.toLocaleString()} DZD`);
      branchTotal += v.total;
    }
    console.log(`  ${'TOTAL'.padEnd(10)} ${' '.repeat(6)}        ${branchTotal.toLocaleString()} DZD`);
    grand += branchTotal;
  }
  console.log(`\nGRAND TOTAL: ${grand.toLocaleString()} DZD`);
  if (DRY_RUN) console.log('\nDry run — nothing was written. Re-run without --dry-run to commit.');
  else console.log('\n✅ Ledger backfill complete.');
}

main().catch((err) => { console.error('Backfill failed:', err); process.exit(1); });
