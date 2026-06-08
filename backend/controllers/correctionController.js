const { admin, db } = require('../config/firebase');
const { createNotification, getBranchAdminUserIds } = require('../services/notificationService');

const FieldValue = admin.firestore.FieldValue;

const LANGUAGE_ENTRIES = 'languageFormEntries';
const TRAINING_ENTRIES = 'trainingFormEntries';

/**
 * Resolve the canonical Firestore document for a payment, plus the field(s) that
 * hold its payment-proof URL and a "kind" describing how it must be updated.
 *
 * Branch isolation: every path is rooted at branches/{branchId}/… or carries an
 * explicit branchId; the global supportLessonRegistrations doc is addressed by id
 * and its branchId is verified by the caller's queue (already branch-scoped).
 */
function resolveDoc({ type, source, branchId, studentId, formId, entryId, registrationId, paymentId }) {
  switch (type) {
    case 'language':
      if (!studentId || !formId) return null;
      return {
        ref: db.collection('branches').doc(branchId).collection('languagesForms')
          .doc(studentId).collection(LANGUAGE_ENTRIES).doc(formId),
        proofFields: ['receiptUrl', 'paymentProof'],
        kind: 'branchForm',
      };
    case 'training':
      if (!studentId || !entryId) return null;
      return {
        ref: db.collection('branches').doc(branchId).collection('trainingsForms')
          .doc(studentId).collection(TRAINING_ENTRIES).doc(entryId),
        proofFields: ['paymentProof', 'receiptUrl'],
        kind: 'branchForm',
      };
    case 'supportLesson':
      if (source === 'annualFee') {
        if (!paymentId) return null;
        return {
          ref: db.collection('branches').doc(branchId).collection('annualPayments').doc(paymentId),
          proofFields: ['receiptUrl'],
          kind: 'annual',
        };
      }
      if (!registrationId) return null;
      return {
        ref: db.collection('supportLessonRegistrations').doc(registrationId),
        proofFields: ['paymentProofUrl', 'paymentProofURL', 'paymentProof'],
        kind: 'supportGlobal',
      };
    case 'annual':
    case 'yearly':
      if (!paymentId) return null;
      return {
        ref: db.collection('branches').doc(branchId).collection('annualPayments').doc(paymentId),
        proofFields: ['receiptUrl'],
        kind: 'annual',
      };
    default:
      return null;
  }
}

// Flip linked annual-fee support-lesson registration summaries to a status.
async function patchLinkedRegistrations(batch, branchId, paymentId, patch) {
  if (!paymentId) return;
  const regsSnap = await db.collection('branches').doc(branchId)
    .collection('registrations').where('paymentId', '==', paymentId).get();
  regsSnap.docs.forEach((d) => batch.set(d.ref, patch, { merge: true }));
}

/**
 * POST /api/corrections/request   (admin only)
 *
 * Moves a payment to status 'needs_correction' WITHOUT rejecting or deleting it.
 * The registration, the student record, and the existing proof file are all kept.
 *
 * Body: { branchId, type, source?, studentId?, formId?, entryId?,
 *         registrationId?, paymentId?, reason }
 */
const requestCorrection = async (req, res, next) => {
  try {
    const adminUid = req.user.uid;
    const {
      branchId, type, source = null,
      studentId = null, formId = null, entryId = null,
      registrationId = null, paymentId = null,
      reason,
    } = req.body || {};

    if (!branchId || !type)
      return res.status(400).json({ code: 'invalid-argument', message: 'branchId and type are required.' });
    if (!reason || !String(reason).trim())
      return res.status(400).json({ code: 'missing-reason', message: 'A correction reason is required.' });

    const resolved = resolveDoc({ type, source, branchId, studentId, formId, entryId, registrationId, paymentId });
    if (!resolved)
      return res.status(400).json({ code: 'invalid-type', message: 'Unknown or incomplete payment reference.' });

    const snap = await resolved.ref.get();
    if (!snap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Payment not found.' });

    const data    = snap.data() || {};
    const ownerId = data.userId || studentId || null;
    const cleanReason = String(reason).trim();

    // Build the correction patch. CRITICAL: we never set rejected/verified-true
    // fields, never clear the proof, never delete the doc.
    const patch = {
      status:                'needs_correction',
      correctionReason:      cleanReason,
      correctionRequestedAt: FieldValue.serverTimestamp(),
      correctionRequestedBy: adminUid,
      correctionCount:       FieldValue.increment(1),
      updatedAt:             FieldValue.serverTimestamp(),
    };
    if (resolved.kind === 'branchForm') {
      patch.verified   = false;
      patch.visibility = 'needs_correction';
    }
    if (resolved.kind === 'annual') {
      patch.paymentStatus = 'needs_correction';
    }

    const batch = db.batch();
    batch.set(resolved.ref, patch, { merge: true });

    // Annual / annual-fee: keep linked support summaries in sync.
    if (resolved.kind === 'annual') {
      await patchLinkedRegistrations(batch, branchId, paymentId, {
        status:                'needs_correction',
        paymentStatus:         'needs_correction',
        correctionReason:      cleanReason,
        correctionRequestedAt: FieldValue.serverTimestamp(),
        correctionRequestedBy: adminUid,
        correctionCount:       FieldValue.increment(1),
        updatedAt:             FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    // ── Notification: payment_correction_requested ───────────────────────────
    if (ownerId) {
      try {
        await createNotification(
          ownerId,
          'مطلوب تصحيح معلومات الدفع',
          `يرجى تصحيح إيصال الدفع: ${cleanReason}`,
          {
            branchId,
            paymentType: type,
            event: 'payment_correction_requested',
            reason: cleanReason,
            paymentId: paymentId || registrationId || formId || entryId || null,
          }
        );
      } catch (e) {
        console.error('[corrections/request] notification error:', e.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/corrections/resubmit   (authenticated student — owner only)
 *
 * Replaces the proof URL with a freshly uploaded one, archives the previous URL,
 * and returns the payment to status 'pending' so it re-enters the admin queue.
 * correctionCount is preserved; lastResubmittedAt is recorded.
 *
 * Body: { branchId, type, source?, studentId?, formId?, entryId?,
 *         registrationId?, paymentId?, newProofUrl }
 */
const resubmitProof = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const {
      branchId, type, source = null,
      studentId = null, formId = null, entryId = null,
      registrationId = null, paymentId = null,
      newProofUrl,
    } = req.body || {};

    if (!branchId || !type)
      return res.status(400).json({ code: 'invalid-argument', message: 'branchId and type are required.' });
    if (!newProofUrl || !/^https?:\/\//i.test(String(newProofUrl)))
      return res.status(400).json({ code: 'invalid-url', message: 'A valid newProofUrl is required.' });

    const resolved = resolveDoc({
      type, source, branchId,
      studentId: studentId || uid, formId, entryId, registrationId, paymentId,
    });
    if (!resolved)
      return res.status(400).json({ code: 'invalid-type', message: 'Unknown or incomplete payment reference.' });

    const snap = await resolved.ref.get();
    if (!snap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Payment not found.' });

    const data    = snap.data() || {};
    const ownerId = data.userId || null;

    // ── Ownership guard: the payment must belong to the requester ────────────
    const pathOwner = studentId || uid;
    const ownsByDoc  = ownerId ? ownerId === uid : false;
    const ownsByPath = resolved.kind === 'branchForm' ? pathOwner === uid : false;
    if (!ownsByDoc && !ownsByPath)
      return res.status(403).json({ code: 'forbidden', message: 'This payment does not belong to you.' });

    // Only correctable payments may be resubmitted.
    const curStatus = String(data.status || '').toLowerCase();
    if (curStatus !== 'needs_correction')
      return res.status(409).json({ code: 'invalid-state', message: 'This payment is not awaiting correction.' });

    const oldUrl = resolved.proofFields.map((f) => data[f]).find(Boolean) || null;

    const patch = {
      status:            'pending',
      lastResubmittedAt: FieldValue.serverTimestamp(),
      updatedAt:         FieldValue.serverTimestamp(),
    };
    resolved.proofFields.forEach((f) => { patch[f] = String(newProofUrl); });
    if (oldUrl) patch.proofHistory = FieldValue.arrayUnion(oldUrl);
    if (resolved.kind === 'branchForm') {
      patch.verified   = false;
      patch.visibility = 'pending';
    }
    if (resolved.kind === 'annual') {
      patch.paymentStatus = 'pending';
    }

    const batch = db.batch();
    batch.set(resolved.ref, patch, { merge: true });

    if (resolved.kind === 'annual') {
      await patchLinkedRegistrations(batch, branchId, paymentId, {
        status:            'pending',
        paymentStatus:     'pending',
        lastResubmittedAt: FieldValue.serverTimestamp(),
        updatedAt:         FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    // ── Notifications ────────────────────────────────────────────────────────
    try {
      await createNotification(
        uid,
        'تم استلام التعديل',
        'تم استلام التعديل وسيتم مراجعته قريباً.',
        { branchId, paymentType: type, event: 'payment_resubmitted' }
      );
      const adminIds = await getBranchAdminUserIds(branchId);
      await Promise.all(adminIds.map((aid) =>
        createNotification(
          aid,
          'تم إعادة رفع إيصال دفع',
          'قام طالب بإعادة رفع إيصال الدفع بعد طلب التصحيح. الطلب في انتظار المراجعة.',
          { branchId, paymentType: type, event: 'payment_resubmitted_admin' }
        )
      ));
    } catch (e) {
      console.error('[corrections/resubmit] notification error:', e.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { requestCorrection, resubmitProof };
