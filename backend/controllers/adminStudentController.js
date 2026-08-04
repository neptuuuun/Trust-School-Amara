/**
 * adminStudentController.js
 * -------------------------
 * "Student 360" aggregate — everything an admin needs about one student in a
 * single branch-scoped round-trip, computed with the Admin SDK.
 *
 * Pulls together: the profile/contact/verification/documents (branch user doc),
 * the annual-fee record + history, every course registration (language /
 * training / support), and the full payment history (paymentOrders). The
 * activity/audit timeline is served separately by the existing /api/audit
 * endpoint (rendered by the frontend EntityHistoryPanel) so it is NOT duplicated
 * here.
 *
 * Branch isolation: requireAdmin pins req.adminBranchId; the user doc must live
 * in that branch (404 otherwise), and the global collections
 * (supportLessonRegistrations, paymentOrders) are additionally filtered to the
 * branch in memory.
 */

const { db } = require('../config/firebase');

function tsToIso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') {
    try { return v.toDate().toISOString(); } catch { return null; }
  }
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Shallow-copy a doc, converting top-level Firestore Timestamps to ISO strings. */
function serialize(id, data) {
  const out = { id };
  for (const [k, v] of Object.entries(data || {})) {
    if (v && typeof v === 'object' && (typeof v.toDate === 'function' || typeof v._seconds === 'number' || typeof v.seconds === 'number')) {
      out[k] = tsToIso(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const getStudentProfile = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId;
    const { userId } = req.params;
    if (!branchId) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }
    if (!userId) {
      return res.status(400).json({ code: 'invalid-argument', message: 'userId is required.' });
    }

    const branchRef = db.collection('branches').doc(branchId);
    const userSnap = await branchRef.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return res.status(404).json({ code: 'not-found', message: 'الطالب غير موجود في هذا الفرع.' });
    }

    const [langSnap, trainSnap, supportSnap, annualSnap, ordersSnap] = await Promise.all([
      branchRef.collection('languagesRegistered').where('userId', '==', userId).get(),
      branchRef.collection('trainingsRegistered').where('userId', '==', userId).get(),
      db.collection('supportLessonRegistrations').where('userId', '==', userId).get(),
      branchRef.collection('annualPayments').where('userId', '==', userId).get(),
      db.collection('paymentOrders').where('studentId', '==', userId).get(),
    ]);

    const profile = serialize(userSnap.id, userSnap.data());

    const languages = langSnap.docs.map((d) => serialize(d.id, d.data()));
    const trainings = trainSnap.docs.map((d) => serialize(d.id, d.data()));
    const support = supportSnap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => r.branchId === branchId);

    const annualPayments = annualSnap.docs
      .map((d) => serialize(d.id, d.data()))
      .sort((a, b) => new Date(b.verifiedAt || b.createdAt || 0) - new Date(a.verifiedAt || a.createdAt || 0));

    const payments = ordersSnap.docs
      .map((d) => {
        const o = d.data() || {};
        return {
          orderId: d.id,
          serviceType: o.serviceType || '',
          serviceName:
            o.serviceName || o.serviceData?.serviceName || o.serviceData?.subjectName ||
            o.serviceData?.trainingName || o.serviceData?.languageName || '',
          amount: Number(o.amount) || 0,
          status: o.status || '',
          currency: o.currency || 'DZD',
          reference: o.chargilyCheckoutId || o.transactionId || d.id,
          createdAt: tsToIso(o.createdAt),
          paidAt: tsToIso(o.paidAt),
          branchId: o.branchId || '',
        };
      })
      .filter((p) => !p.branchId || p.branchId === branchId)
      .sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0));

    const annualFeePaid = annualPayments.some((p) => p.status === 'verified');

    return res.json({
      branchId,
      profile,
      verification: {
        status: profile.verificationStatus || 'pending',
        idCardUrl: profile.idCardUrl || null,
        photoUrl: profile.profilePictureUrl || profile.photoUrl || null,
      },
      annualFee: {
        paid: annualFeePaid,
        current: annualPayments[0] || null,
        history: annualPayments,
      },
      registrations: {
        languages,
        trainings,
        support,
        counts: {
          languages: languages.length,
          trainings: trainings.length,
          support: support.length,
        },
      },
      payments,
      totals: {
        payments: payments.length,
        captured: payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStudentProfile };
