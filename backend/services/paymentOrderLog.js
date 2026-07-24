/**
 * paymentOrderLog.js
 * ------------------
 * Records an in-school (cash / physical) enrollment into `paymentOrders`.
 *
 * WHY
 * After the Chargily migration `paymentOrders` became the branch's payment log,
 * and the admin "سجل المدفوعات" page is built on it. But only the ONLINE checkout
 * path ever wrote to it: every admin-side manual enrollment (language approve,
 * training approve, language/training direct-add, support admin-create, annual
 * fee record) wrote its registration + ledger entry and nothing else. The result
 * was a payment log that advertised "Chargily Pay + نقداً" while the cash column
 * was structurally always zero, and an admin who collected money at the desk had
 * no payment record to search, filter, or reconcile against.
 *
 * This helper closes that gap without touching the ledger (which remains the
 * immutable financial source of truth and is written separately by
 * recordRegistrationRevenue / ledgerService). A paymentOrder written here is an
 * operational receipt, not a second revenue entry — reporting reads the ledger.
 *
 * CONTRACT
 *  • Best-effort ONLY. The registration has already committed by the time this
 *    runs, so a failure here must never surface to the caller or roll anything
 *    back — it is logged and swallowed.
 *  • Deterministic document id derived from (sourceCollection, sourceDocId) so a
 *    retried approval converges on ONE order instead of duplicating the log.
 *  • status is always 'paid': an admin only records money already collected.
 */

const { admin, db } = require('../config/firebase');

/** Firestore ids may not contain '/'; source ids are Firestore ids already. */
const orderIdFor = (sourceCollection, sourceDocId) =>
  `manual_${String(sourceCollection || 'unknown')}_${String(sourceDocId || '')}`.replace(/[^\w-]/g, '_');

/**
 * @param {object}  p
 * @param {string}  p.branchId
 * @param {string}  p.serviceType        language | training | support | annualFee
 * @param {string}  p.sourceCollection   collection the registration lives in
 * @param {string}  p.sourceDocId        registration document id
 * @param {object}  p.regData            registration payload (for denormalised student fields)
 * @param {number}  p.amount             amount collected, in DZD
 * @param {object}  p.actor              { uid, email } of the admin who collected it
 * @param {string} [p.paymentMethod]     defaults to 'cash'
 */
async function recordManualPaymentOrder({
  branchId,
  serviceType,
  sourceCollection,
  sourceDocId,
  regData = {},
  amount,
  actor = {},
  paymentMethod = 'cash',
}) {
  try {
    if (!branchId || !serviceType || !sourceDocId) return null;

    const orderId = orderIdFor(sourceCollection, sourceDocId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const numericAmount = Number(amount);

    const serviceName =
      regData.subjectName || regData.languageName || regData.trainingTitle ||
      regData.trainingName || regData.lessonName || '';

    await db.collection('paymentOrders').doc(orderId).set({
      studentId:    regData.userId || regData.studentId || null,
      studentName:  regData.studentName || regData.userName || '',
      studentEmail: regData.userEmail || regData.studentEmail || '',
      branchId,
      serviceType,
      serviceData: {
        serviceName,
        classId:   regData.classId || null,
        groupName: regData.groupName || '',
      },
      amount:   Number.isFinite(numericAmount) ? numericAmount : 0,
      currency: 'DZD',
      paymentMethod,
      // Online-only fields kept present-and-null so every consumer can read the
      // same shape regardless of channel.
      chargilyCheckoutId:  null,
      chargilyCheckoutUrl: null,
      chargilyPaymentId:   null,
      status:        'paid',
      paid:          true,
      paymentStatus: 'paid',
      source:        'admin',
      sourceCollection: sourceCollection || null,
      registrationId:   sourceDocId,
      recordedBy: { uid: actor.uid || '', email: actor.email || '' },
      createdAt:   now,
      paidAt:      now,
      processedAt: now,
      needsAttention: false,
    }, { merge: true });

    return orderId;
  } catch (err) {
    console.error('[paymentOrderLog] failed to record manual order:', err.message);
    return null;
  }
}

module.exports = { recordManualPaymentOrder, orderIdFor };
