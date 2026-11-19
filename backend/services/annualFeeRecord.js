/**
 * annualFeeRecord.js  (backend / CommonJS, PURE — no firebase, no I/O)
 * --------------------------------------------------------------------
 * Builds the data portion of an `annualPayments` document for an admin-recorded
 * (manual / cash-at-the-desk) annual fee. Kept pure so the field semantics can be
 * unit-tested without touching Firestore.
 *
 * WHY THIS EXISTS — the bug it prevents:
 *   The platform-wide academic-year system treats `academicYear` as the canonical
 *   "YYYY-YYYY" label on EVERY academic record, and every reader filters on it:
 *     • admin list      → where('academicYear', '==', <label>)     (AnnualFees.js)
 *     • admin overview  → where('academicYear', '==', yearLabel)   (adminOverviewController)
 *     • student profile → academicYearMatches(doc, <label>, …)     (StudentDashboard)
 *     • eligibility     → p.academicYear === <label>               (isAnnualFeePaidThisYear)
 *     • chargily writer → academicYear: <label>                    (chargilyController)
 *   The manual writer used to put the student's GRADE ("sec3") in `academicYear`
 *   instead of the label. The write succeeded (success toast was honest) but no
 *   reader could match it by year, so the payment was invisible in the admin list,
 *   zeroed the dashboard stats, and showed the student as UNPAID — while the grade
 *   it actually needed was already available in `studyYear` / `level`.
 *
 *   The grade therefore belongs in `studyYear` + `level` (mirrors chargilyController),
 *   and `academicYear` MUST hold the same "YYYY-YYYY" label as `year`.
 */

const DEFAULT_NOTE = 'تم تسجيل الرسوم السنوية يدوياً من قبل الإدارة';

/**
 * @param {object}  p
 * @param {string}  p.userId         student uid
 * @param {string} [p.studentName]
 * @param {string} [p.studentEmail]
 * @param {string} [p.studentPhone]
 * @param {number}  p.amount         snapshotted, owner-configured fee (DZD)
 * @param {string}  p.label          academic-year label "YYYY-YYYY" (THE canonical year)
 * @param {?string} [p.grade]        grade id ("sec3" / "mid1") — goes to studyYear/level
 * @param {string} [p.school]        normalized school
 * @param {?string}[p.notes]
 * @param {string} [p.source]        write channel (default 'admin_manual')
 * @returns {object} the non-timestamp, non-actor fields of the annualPayments doc
 */
function buildAnnualFeePaymentDoc({
  userId,
  studentName = '',
  studentEmail = '',
  studentPhone = '',
  amount,
  label,
  grade = null,
  school = '',
  notes = null,
  source = 'admin_manual',
}) {
  return {
    userId,
    userName: studentName,
    studentName,
    userEmail: studentEmail,
    studentPhone,
    amount,
    // `year` and `academicYear` BOTH carry the same "YYYY-YYYY" label. `academicYear`
    // is the field every reader filters on — it must never hold a grade.
    year: label,
    academicYear: label,
    // The grade lives here (and ONLY here), matching the Chargily schema.
    studyYear: grade,
    level: grade,
    school,
    paymentMethod: 'physical',
    source,
    status: 'verified',
    paymentStatus: 'verified',
    notes: notes || DEFAULT_NOTE,
  };
}

module.exports = { buildAnnualFeePaymentDoc, DEFAULT_NOTE };
