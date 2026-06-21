/**
 * Financial ledger service — the single source of truth for revenue.
 *
 * The `/ledger` collection is APPEND-ONLY and server-authored (Admin SDK only;
 * Firestore rules deny all client writes and ALL updates/deletes). A payment is
 * recorded once. Corrections never mutate history — they append a `reversal`
 * (negative amount) and/or a fresh `payment`/`adjustment` entry. Net revenue for
 * any slice is therefore simply the SUM of `amount` over the matching entries.
 *
 * Entry shape:
 *   {
 *     branchId, studentId, studentName,
 *     serviceType: 'language'|'support'|'training'|'annualFee',
 *     subjectId, subjectName, classId, className, teacherId, teacherName,
 *     amount (number, signed: payments +, reversals -), currency: 'DZD',
 *     period ('YYYY-MM' for monthly support, else academic-year label),
 *     type: 'payment'|'reversal'|'adjustment', status: 'active',
 *     sourceCollection, sourceDocId, reversalOf?,
 *     recordedBy: { uid, email, role }, recordedAt, paidAt
 *   }
 */

const { admin, db } = require('../config/firebase');
const academicYear = require('./academicYear');

const FieldValue = admin.firestore.FieldValue;
const LEDGER = 'ledger';
const CURRENCY = 'DZD';

const SERVICE_TYPES = ['language', 'support', 'training', 'annualFee'];

// ── helpers ──────────────────────────────────────────────────────────────────

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Month bucket 'YYYY-MM' — the period key for monthly support revenue. */
function monthKey(date = new Date()) {
  const d = toDate(date) || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Academic-year label, e.g. '2025-2026'. The school year runs 1 July → 30 June,
 * so Jul–Dec belong to year→year+1 and Jan–Jun to year-1→year. Delegates to the
 * centralized engine in ./academicYear so every period label uses one rule.
 */
function academicYearLabel(date = new Date()) {
  return academicYear.getAcademicYearLabel(date);
}

/**
 * Field-priority amount resolver — mirrors the read-time logic the admin
 * PaymentsVerification page already relies on, so the ledger matches what
 * admins see.
 */
function deriveAmount(serviceType, data = {}, classData = null) {
  switch (serviceType) {
    case 'annualFee':
      return toNumber(data.amount ?? data.price);
    case 'training':
      return toNumber(data.trainingPrice ?? data.price ?? data.amount);
    case 'language':
      return toNumber(data.languagePrice ?? data.price ?? data.levelPrice ?? data.amount);
    case 'support':
      return toNumber(
        data.monthlyPrice ?? data.pricePerMonth ?? data.amount ??
        (classData ? (classData.price ?? classData.monthlyPrice) : 0)
      );
    default:
      return toNumber(data.amount);
  }
}

/** Deterministic id so backfill + live recording are idempotent (no dupes). */
function ledgerId(sourceCollection, branchId, sourceDocId) {
  return [sourceCollection, branchId, sourceDocId].join('__');
}

// ── writes ───────────────────────────────────────────────────────────────────

/**
 * Record a payment entry (idempotent on the deterministic id). Re-running the
 * backfill or double-firing a recorder call merges onto the same doc rather than
 * creating duplicates. Returns the ledger entry id.
 */
async function recordPayment(entry = {}) {
  const branchId = entry.branchId;
  const sourceCollection = entry.sourceCollection;
  const sourceDocId = entry.sourceDocId;
  if (!branchId || !sourceCollection || !sourceDocId) {
    throw new Error('recordPayment requires branchId, sourceCollection and sourceDocId');
  }

  const id = entry.id || ledgerId(sourceCollection, branchId, sourceDocId);
  const ref = db.collection(LEDGER).doc(id);

  const doc = {
    branchId,
    studentId:   entry.studentId   || null,
    studentName: entry.studentName || null,
    serviceType: entry.serviceType || null,
    subjectId:   entry.subjectId   || null,
    subjectName: entry.subjectName || null,
    classId:     entry.classId     || null,
    className:   entry.className    || null,
    teacherId:   entry.teacherId   || null,
    teacherName: entry.teacherName || null,
    amount:      toNumber(entry.amount),
    currency:    CURRENCY,
    period:      entry.period      || null,
    type:        entry.type        || 'payment',
    status:      'active',
    sourceCollection,
    sourceDocId,
    recordedBy:  entry.recordedBy  || { role: 'system' },
    recordedAt:  FieldValue.serverTimestamp(),
    paidAt:      entry.paidAt ? admin.firestore.Timestamp.fromDate(toDate(entry.paidAt)) : FieldValue.serverTimestamp(),
  };

  await ref.set(doc, { merge: true });
  return id;
}

/**
 * Append a reversal of a previously recorded payment. Never edits the original.
 * The reversal carries the negated amount, so net revenue = SUM(amount) stays
 * correct. Deterministic id keeps reversals idempotent too.
 */
async function recordReversal(originalLedgerId, { recordedBy = null, reason = null } = {}) {
  if (!originalLedgerId) throw new Error('recordReversal requires originalLedgerId');
  const origRef = db.collection(LEDGER).doc(originalLedgerId);
  const origSnap = await origRef.get();
  if (!origSnap.exists) return null;
  const orig = origSnap.data() || {};

  const id = `reversal__${originalLedgerId}`;
  await db.collection(LEDGER).doc(id).set({
    ...orig,
    amount:     -toNumber(orig.amount),
    type:       'reversal',
    status:     'active',
    reversalOf: originalLedgerId,
    reason:     reason || null,
    recordedBy: recordedBy || { role: 'system' },
    recordedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return id;
}

module.exports = {
  LEDGER,
  SERVICE_TYPES,
  recordPayment,
  recordReversal,
  deriveAmount,
  monthKey,
  academicYearLabel,
  ledgerId,
  toNumber,
  toDate,
};
