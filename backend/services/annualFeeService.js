/**
 * annualFeeService.js
 * -------------------
 * THE single implementation of "record a verified annual fee payment for an
 * existing student". Extracted verbatim from the POST /api/admin/record-annual-fee
 * controller so that every admin write path shares it:
 *   • the Annual Fees page / "Add annual fee payment" modal (that endpoint),
 *   • individual registration with "annual fee paid" ticked (same endpoint),
 *   • the bulk importer for rows marked «مدفوع».
 *
 * What it guarantees (unchanged from the original controller):
 *   • The amount is the owner-configured fee (config/finance), SNAPSHOTTED on the
 *     record — never trusted from a client.
 *   • One verified annual fee per student per academic year (duplicate guard).
 *   • `academicYear`/`year` hold the "YYYY-YYYY" label; the grade goes to
 *     studyYear/level (see annualFeeRecord.js for the why).
 *   • The profile flags readers depend on are set ONLY after the verified
 *     payment record exists — a student is never "paid" without a payment.
 *   • Ledger + audit + operational payment log are written (best-effort).
 *
 * The grade defaults to the level ALREADY SAVED on the profile, so recording a
 * payment later never requires re-entering the student's academic level.
 */

const { admin, db } = require('../config/firebase');
const ledger = require('./ledgerService');
const { writeAudit } = require('./auditService');
const academicYear = require('./academicYear');
const financeSettings = require('./financeSettings');
const { recordManualPaymentOrder } = require('./paymentOrderLog');
const { buildAnnualFeePaymentDoc } = require('./annualFeeRecord');
const { normalizeSchool } = require('../constants');
const { schoolLevelOf } = require('./studentFields');

class AnnualFeeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.isAnnualFeeError = true;
  }
}

/**
 * @param {object} p
 * @param {string}  p.branchId
 * @param {string}  p.userId
 * @param {?string} [p.studyYear]  explicit grade; falls back to the profile's saved level
 * @param {?string} [p.paidAt]     ISO date (may be backdated); default now
 * @param {?string} [p.notes]
 * @param {{uid:string,email?:string}} p.actor
 * @param {string}  [p.via]        audit tag for the write channel (e.g. 'bulk-import')
 * @returns {Promise<{paymentId, amount, academicYear, studyYear}>}
 * @throws {AnnualFeeError} not-found | permission-denied | already-paid
 */
async function recordAnnualFeeForStudent({ branchId, userId, studyYear, paidAt, notes, actor, via }) {
  const adminUid   = actor.uid;
  const adminEmail = actor.email || '';

  // Load the student profile — existence + branch guard + denormalization source.
  const userRef  = db.collection('branches').doc(branchId).collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new AnnualFeeError(404, 'not-found', 'Student not found.');

  const userData      = userSnap.data() || {};
  const studentBranch = userData.branchId || userData.branch;
  if (studentBranch && studentBranch !== branchId) {
    throw new AnnualFeeError(403, 'permission-denied', 'Student does not belong to your branch.');
  }

  // Academic-year context. paidAt may be a backdated ISO date; default to now.
  const paidDate  = paidAt ? new Date(paidAt) : new Date();
  const validPaid = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
  const ay        = academicYear.getAcademicYear(validPaid);
  const label     = ay.label;

  // Grade/level: explicit param wins, else the level already saved on the profile.
  const grade       = String(studyYear || userData.studyYear || '').trim() || null;
  const schoolLevel = grade ? (schoolLevelOf(grade) || userData.schoolLevel || null) : (userData.schoolLevel || null);

  // ── Duplicate guard — one verified annual fee per student per academic year.
  // Single-field query (no composite index) + in-memory academic-year check.
  const paymentsRef  = db.collection('branches').doc(branchId).collection('annualPayments');
  const existingSnap = await paymentsRef.where('userId', '==', userId).get();
  const dupe = existingSnap.docs.map((d) => d.data() || {}).some((p) => {
    if (String(p.status || '').toLowerCase() !== 'verified') return false;
    if (p.year === label || p.academicYear === label) return true;
    const d = academicYear.toJsDate(p.verifiedAt || p.createdAt);
    return Boolean(d && d.getTime() >= ay.startMs && d.getTime() <= ay.endMs);
  });
  if (dupe) {
    throw new AnnualFeeError(409, 'already-paid', 'هذا الطالب دفع الرسوم السنوية لهذه السنة الدراسية بالفعل.');
  }

  // ── Snapshot the configured amount (never trust a client-supplied amount) ──
  const amount = await financeSettings.getAnnualFeeAmount();

  const studentName  = userData.name || userData.fullName || '';
  const studentEmail = userData.email || '';
  const studentPhone = userData.phoneNumber || userData.phone || '';
  const school       = normalizeSchool(userData.school);
  const nowTs        = admin.firestore.FieldValue.serverTimestamp();
  const paidTs       = admin.firestore.Timestamp.fromDate(validPaid);

  // ── Canonical annualPayments doc (mirrors the Chargily/cash schema) ───────
  const payRef = paymentsRef.doc();
  await payRef.set({
    ...buildAnnualFeePaymentDoc({
      userId,
      studentName,
      studentEmail,
      studentPhone,
      amount,
      label,
      grade,
      school,
      notes,
      source: 'admin_manual',
    }),
    createdAt:  paidTs,
    verifiedAt: nowTs,
    verifiedBy: { uid: adminUid, email: adminEmail, name: '' },
    recordedBy: { uid: adminUid, email: adminEmail, role: 'admin' },
  });

  // ── Student profile: union of every flag readers depend on ────────────────
  const userPatch = {
    yearlyFeePaid:      true,
    paymentVerified:    true,
    annualFeePaid:      true,
    annualFeeYear:      label,
    annualFeePaymentId: payRef.id,
    updatedAt:          nowTs,
    'registrations.annualFee': label,
    'registrations.annualFeeHistory': admin.firestore.FieldValue.arrayUnion({
      registrationId: payRef.id,
      year:           label,   // "YYYY-YYYY" — what the UI renders
      academicYear:   label,   // same canonical label (never a grade)
      studyYear:      grade || null,
      registeredAt:   Date.now(),
      source:         'admin_manual',
    }),
  };
  if (grade) {
    userPatch.studyYear    = grade;
    // The saved level now refers to the fee's academic year.
    userPatch.academicYear = label;
  }
  if (schoolLevel) userPatch.schoolLevel = schoolLevel;
  await userRef.update(userPatch);

  // ── Ledger + audit (best-effort; never fail the request on a log error) ───
  try {
    await ledger.recordPayment({
      branchId,
      studentId:   userId,
      studentName,
      serviceType: 'annualFee',
      amount,
      period:      label,
      sourceCollection: 'annualPayments',
      sourceDocId: payRef.id,
      recordedBy:  { uid: adminUid, email: adminEmail, role: 'admin' },
      paidAt:      validPaid,
    });
    await writeAudit({
      branchId,
      actor: { uid: adminUid, email: adminEmail, role: 'admin' },
      action: 'payment.record',
      targetType: 'annualPayment',
      targetId: payRef.id,
      after: { status: 'verified', amount, userId, academicYear: label, ...(via ? { via } : {}) },
    });
    // Operational receipt in the branch payment log (the ledger above stays the
    // single revenue record — this is only so an admin can find/reconcile the
    // cash they took at the desk in سجل المدفوعات).
    await recordManualPaymentOrder({
      branchId, serviceType: 'annualFee',
      sourceCollection: 'annualPayments', sourceDocId: payRef.id,
      regData: { userId, studentName, subjectName: `الرسوم السنوية ${label}` },
      amount,
      actor: { uid: adminUid, email: adminEmail },
    });
  } catch (logErr) {
    console.error('[annualFee] ledger/audit error:', logErr.message);
  }

  return { paymentId: payRef.id, amount, academicYear: label, studyYear: grade };
}

module.exports = { recordAnnualFeeForStudent, AnnualFeeError };
