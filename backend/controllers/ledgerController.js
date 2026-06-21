/**
 * Recorder endpoints used by the still-client-side verification flows
 * (language / training / support) to append to the server-authored ledger and
 * audit log right after they commit a Firestore verification.
 *
 * Both are admin-only and strictly branch-bound (requireAdmin attaches
 * req.adminBranchId and rejects any branchId that isn't the admin's own).
 * Non-atomic with the verify write by design — the backfill/reconcile script
 * closes any gap. Idempotent on the ledger's deterministic id, so a retry never
 * double-counts.
 */

const { admin, db } = require('../config/firebase');
const ledger = require('../services/ledgerService');
const { writeAudit } = require('../services/auditService');

/**
 * POST /api/ledger/record   (admin only, branch-bound)
 *
 * Body: { branchId, serviceType, sourceCollection, sourceDocId,
 *         studentId?, studentName?, classId?, subjectId?, subjectName?,
 *         className?, teacherId?, teacherName?, amount, period?, paidAt? }
 *
 * When classId is supplied, missing teacher/subject/className fields are enriched
 * from the class document so the ledger stays attributable for teacher analytics.
 */
const recordEntry = async (req, res, next) => {
  try {
    const b = req.body || {};
    const branchId = b.branchId || req.adminBranchId;
    if (!branchId)
      return res.status(400).json({ code: 'invalid-argument', message: 'branchId is required.' });
    if (!b.serviceType || !ledger.SERVICE_TYPES.includes(b.serviceType))
      return res.status(400).json({ code: 'invalid-argument', message: `serviceType must be one of: ${ledger.SERVICE_TYPES.join(', ')}` });
    if (!b.sourceCollection || !b.sourceDocId)
      return res.status(400).json({ code: 'invalid-argument', message: 'sourceCollection and sourceDocId are required.' });

    let { classId, subjectId, subjectName, className, teacherId, teacherName } = b;

    // Enrich from the class document when we have a classId but missing attribution.
    if (classId && (!teacherName || !subjectId || !className)) {
      try {
        const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
        if (clsSnap.exists) {
          const cls = clsSnap.data() || {};
          subjectId   = subjectId   || cls.subjectId   || null;
          subjectName = subjectName || cls.subjectName  || null;
          className   = className   || cls.groupName || cls.name || null;
          teacherId   = teacherId   || cls.teacherId   || null;
          teacherName = teacherName || cls.teacherName  || null;
        }
      } catch { /* enrichment is best-effort */ }
    }

    const id = await ledger.recordPayment({
      branchId,
      studentId:   b.studentId   || null,
      studentName: b.studentName || null,
      serviceType: b.serviceType,
      subjectId, subjectName, classId, className, teacherId, teacherName,
      amount:      b.amount,
      period:      b.period || (b.serviceType === 'support' ? ledger.monthKey() : ledger.academicYearLabel()),
      sourceCollection: b.sourceCollection,
      sourceDocId: b.sourceDocId,
      recordedBy:  { uid: req.user.uid, email: req.user.email || '', role: 'admin' },
      paidAt:      b.paidAt || null,
    });

    return res.status(201).json({ success: true, ledgerId: id });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/audit/log   (admin only, branch-bound)
 *
 * Body: { branchId, action, targetType?, targetId?, before?, after?, reason? }
 */
const logAudit = async (req, res, next) => {
  try {
    const b = req.body || {};
    const branchId = b.branchId || req.adminBranchId;
    if (!b.action)
      return res.status(400).json({ code: 'invalid-argument', message: 'action is required.' });

    const id = await writeAudit({
      branchId,
      actor: { uid: req.user.uid, email: req.user.email || '', role: 'admin' },
      action: b.action,
      targetType: b.targetType || null,
      targetId: b.targetId || null,
      before: b.before || null,
      after: b.after || null,
      reason: b.reason || null,
    });

    return res.status(201).json({ success: true, auditId: id });
  } catch (err) {
    next(err);
  }
};

module.exports = { recordEntry, logAudit };
