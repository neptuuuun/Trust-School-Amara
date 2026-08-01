/**
 * chargilyController.js
 * ---------------------
 * Handles Chargily Pay integration:
 *  - createCheckout  → student initiates online payment
 *  - handleWebhook   → Chargily notifies us of payment result (signed)
 *  - getOrderStatus  → frontend polls after returning from Chargily
 *  - verifyAndProcess → fallback manual verify if webhook was missed
 *  - listOrders      → admin views payment history
 *
 * All registration creation happens server-side (Admin SDK) — clients never
 * write registration documents directly.
 */

const { admin, db } = require('../config/firebase');
const chargilyService = require('../services/chargilyService');
const ledger = require('../services/ledgerService');
const academicYear = require('../services/academicYear');
const financeSettings = require('../services/financeSettings');
const { monthKeyOf, startOfMonth, computeCycleEnd, computeProration } = require('../services/sessionService');
const { normalizeSchool } = require('../constants');
const { assertNoStudentConflict } = require('../services/scheduleConflictService');
const { writeAudit } = require('../services/auditService');
// Shared enforcement primitives — the live (online-payment) enrollment path runs
// the SAME gates as the admin approval paths so capacity / RULE A-B / duplicate /
// schedule-conflict / ledger / audit invariants hold for self-service payments.
const { assertCapacityInTx, recordRegistrationRevenue } = require('./academicController');
const {
  resolveClassificationAndEnforce,
  isAnnualFeePaidThisYear,
  recomputeSupportClassEnrollment,
  hasActiveSupportRegistration,
} = require('./registrationController');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const BACKEND_URL  = (process.env.BACKEND_URL  || '').replace(/\/$/, '');

const SERVICE_LABELS = {
  language:  'دورة لغة',
  training:  'دورة تكوينية',
  support:   'درس دعم',
  annualFee: 'رسوم سنوية',
};

/** Firestore Timestamp | Date | ms | ISO → epoch ms (0 when unusable). */
const tsMs = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') { try { return v.toDate().getTime(); } catch { return 0; } }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// ─── Duplicate-registration guards ────────────────────────────────────────────
// A student must never be sent to pay for something they are already enrolled in.
// The registration factory also refuses duplicates transactionally, but by then the
// money is already taken — so we pre-check here and refuse the checkout up front.
// Pure equality filters (userId + classId/…) resolve via single-field indexes; no
// composite index is required.

async function hasLanguageRegistration(branchId, studentId, sd = {}) {
  const col = db.collection('branches').doc(branchId).collection('languagesRegistered');
  if (sd.classId) {
    const s = await col.where('userId', '==', studentId).where('classId', '==', sd.classId).limit(1).get();
    if (!s.empty) return true;
  }
  const languageId = sd.languageId || sd.subjectId;
  if (languageId && sd.levelId) {
    const s = await col.where('userId', '==', studentId)
      .where('languageId', '==', languageId).where('levelId', '==', sd.levelId).limit(1).get();
    if (!s.empty) return true;
  }
  return false;
}

async function hasTrainingRegistration(branchId, studentId, sd = {}) {
  const trainingId = sd.trainingId || sd.subjectId;
  if (!trainingId) return false;
  const s = await db.collection('branches').doc(branchId).collection('trainingsRegistered')
    .where('userId', '==', studentId).where('trainingId', '==', trainingId).limit(1).get();
  return !s.empty;
}

// ─── Create Checkout ──────────────────────────────────────────────────────────

async function createCheckout(req, res) {
  try {
    // NOTE: req.body.amount is deliberately NOT destructured. The client sends one,
    // but the charge is resolved server-side below and written to the immutable
    // ledger as revenue truth — binding the client's number to a local here has
    // only ever been a way for it to get used by accident.
    const { branchId, serviceType, serviceData = {} } = req.body;

    const studentId    = req.user.uid;
    const studentEmail = req.user.email || '';
    const studentName  = serviceData.studentName || '';

    if (!branchId || !serviceType) {
      return res.status(400).json({ code: 'missing-fields', message: 'حقول مطلوبة مفقودة.' });
    }

    // ── Resolve the authoritative charge amount SERVER-SIDE ───────────────────
    // The amount is recorded to the IMMUTABLE ledger as revenue truth, so it must
    // never be taken from the client. annualFee → owner config; language/training →
    // class catalog price; support → server proration for the calendar-month cycle
    // (plus the annual fee only when genuinely still owed). We also pre-check
    // capacity / already-paid so a student is never sent to pay for a full class or
    // a fee they no longer owe.
    let chargeAmount;
    if (serviceType === 'annualFee') {
      if (await isAnnualFeePaidThisYear(branchId, studentId)) {
        return res.status(409).json({ code: 'already-paid', message: 'الرسوم السنوية مدفوعة بالفعل لهذه السنة الدراسية.' });
      }
      chargeAmount = await financeSettings.getAnnualFeeAmount();
    } else {
      // Refuse a second checkout when the student is already enrolled. Support may
      // be RENEWED once the previous cycle has ended, so only an ACTIVE (non-expired)
      // subscription blocks it; language/training enrollments are one-shot.
      if (serviceType === 'support') {
        if (serviceData.classId && await hasActiveSupportRegistration(branchId, studentId, serviceData.classId)) {
          return res.status(409).json({ code: 'already-registered', message: 'أنت مسجّل بالفعل في هذا الدرس.' });
        }
      } else if (serviceType === 'language') {
        if (await hasLanguageRegistration(branchId, studentId, serviceData)) {
          return res.status(409).json({ code: 'already-registered', message: 'أنت مسجّل بالفعل في هذه الدورة.' });
        }
      } else if (serviceType === 'training') {
        if (await hasTrainingRegistration(branchId, studentId, serviceData)) {
          return res.status(409).json({ code: 'already-registered', message: 'أنت مسجّل بالفعل في هذه الدورة.' });
        }
      }

      const classId = serviceData.classId;
      let cls = null;
      if (classId) {
        const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
        if (clsSnap.exists) cls = clsSnap.data() || {};
      }

      if (cls) {
        // Class-based (the live flow): capacity pre-check + catalog price/proration.
        const cap = Number(cls.capacity) || 0;
        const enrolled = Number(cls.enrollmentCount) || 0;
        if (cap > 0 && enrolled >= cap) {
          return res.status(409).json({ code: 'class-full', message: 'اكتمل العدد في هذه المجموعة.' });
        }
        if (serviceType === 'support') {
          chargeAmount = computeProration(cls, new Date()).amountDue;
          if (serviceData.includesAnnualFee && !(await isAnnualFeePaidThisYear(branchId, studentId))) {
            chargeAmount += await financeSettings.getAnnualFeeAmount();
          }
        } else {
          chargeAmount = Number(cls.price) || 0;
        }
      } else if (serviceType === 'training' && serviceData.trainingId) {
        // Legacy class-less training: price comes from the trainings catalog doc.
        const tSnap = await db.collection('branches').doc(branchId).collection('trainings').doc(serviceData.trainingId).get();
        if (!tSnap.exists) return res.status(404).json({ code: 'training-not-found', message: 'الدورة غير موجودة.' });
        chargeAmount = Number((tSnap.data() || {}).price) || 0;
      } else {
        // support/language MUST be class-based; never trust a client amount.
        return res.status(serviceType === 'support' ? 404 : 400)
          .json({ code: 'missing-class', message: serviceType === 'support' ? 'المجموعة غير موجودة.' : 'classId is required.' });
      }
    }

    if (!Number.isFinite(chargeAmount) || chargeAmount < 0) {
      return res.status(400).json({ code: 'invalid-amount', message: 'تعذّر تحديد المبلغ.' });
    }

    // Create the paymentOrder document first so we have its ID for the checkout metadata.
    const orderRef  = db.collection('paymentOrders').doc();
    const orderId   = orderRef.id;

    await orderRef.set({
      studentId,
      studentName,
      studentEmail,
      branchId,
      serviceType,
      serviceData,
      amount: chargeAmount,
      currency:          'DZD',
      paymentMethod:     'chargily',
      chargilyCheckoutId:  null,
      chargilyCheckoutUrl: null,
      status:      'pending_payment',
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      paidAt:      null,
      registrationId: null,
      processedAt:    null,
    });

    // Build webhook URL only when BACKEND_URL is configured (not available in local dev).
    const webhookUrl = BACKEND_URL ? `${BACKEND_URL}/api/chargily/webhook` : undefined;

    const serviceName = serviceData.serviceName || serviceData.subjectName || serviceData.trainingName || '';

    // ═══ TEMP DEBUG — remove after diagnosing the Chargily 422 ═══════════════════
    // Derived module constants + raw env, captured in the controller scope right
    // before handing off to the Chargily service layer. Proves whether the
    // .replace()/fallback at lines 35-36 altered anything vs the raw env value.
    console.log("========== CHARGILY URL BUILD (controller) ==========");
    console.log({
      raw_env_FRONTEND_URL: process.env.FRONTEND_URL,
      raw_env_BACKEND_URL:  process.env.BACKEND_URL,
      derived_FRONTEND_URL: FRONTEND_URL,
      derived_BACKEND_URL:  BACKEND_URL,
      built_successUrl: `${FRONTEND_URL}/payment/status?orderId=${orderId}&result=success`,
      built_failureUrl: `${FRONTEND_URL}/payment/status?orderId=${orderId}&result=failure`,
      built_webhookUrl: webhookUrl,
      chargeAmount, chargeAmount_type: typeof chargeAmount, chargeAmount_isInteger: Number.isInteger(chargeAmount),
      serviceType,
    });
    console.log("=====================================================");
    // ═══ END TEMP DEBUG ══════════════════════════════════════════════════════════

    const checkout = await chargilyService.createCheckout({
      amount: chargeAmount,
      currency:        'dzd', // Chargily v2 requires the lowercase ISO code; 'DZD' → 422.

      description:     `${SERVICE_LABELS[serviceType] || serviceType}${serviceName ? ` — ${serviceName}` : ''}`,
      metadata:        { orderId, studentId, branchId, serviceType },
      successUrl:      `${FRONTEND_URL}/payment/status?orderId=${orderId}&result=success`,
      failureUrl:      `${FRONTEND_URL}/payment/status?orderId=${orderId}&result=failure`,
      webhookEndpoint: webhookUrl,
    });

    await orderRef.update({
      chargilyCheckoutId:  checkout.id,
      chargilyCheckoutUrl: checkout.checkout_url,
    });

    return res.json({ orderId, checkoutUrl: checkout.checkout_url });

  } catch (err) {
    console.error('[chargily] createCheckout error:', err.message);
    // ═══ TEMP DEBUG — remove after diagnosing the Chargily 422 ═══════════════════
    // The COMPLETE response body Chargily returned (chargilyFetch attaches the
    // parsed JSON as err.body and the HTTP status as err.status). This is the
    // authoritative reason for the 422 — the validation message names the field.
    console.error("========== CHARGILY RESPONSE (error) ==========");
    console.error("status:", err.status);
    console.error("body:  ", JSON.stringify(err.body ?? err.response?.data ?? { message: err.message }, null, 2));
    console.error("===============================================");
    // ═══ END TEMP DEBUG ══════════════════════════════════════════════════════════
    return res.status(500).json({ code: 'checkout-error', message: err.message });
  }
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────
// express.raw() is applied to this route in chargily.js so req.body is a Buffer.

async function handleWebhook(req, res) {
  const rawBody   = req.body; // Buffer
  const signature = req.headers['signature'];

  if (!chargilyService.verifyWebhookSignature(rawBody, signature)) {
    console.warn('[chargily] Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Respond immediately — process asynchronously so Chargily gets a quick 200.
  res.json({ received: true });

  processWebhookEvent(event).catch((err) =>
    console.error('[chargily] webhook async error:', err.message, err.stack)
  );
}

async function processWebhookEvent(event) {
  if (event.type !== 'checkout.paid') return;

  const checkout = event.data;
  const orderId  = checkout?.metadata?.orderId;
  if (!orderId) {
    console.warn('[chargily] webhook: missing orderId in metadata');
    return;
  }

  await finalizePaidOrder(db.collection('paymentOrders').doc(orderId), orderId, checkout);
}

// ─── Shared Confirmation Primitive ────────────────────────────────────────────
// The single place a Chargily payment is turned into a paid order + a real
// registration. Used by BOTH the webhook and the verify fallback so the two paths
// can never diverge. The order is claimed inside a transaction, so a re-fired
// webhook or a concurrent verify call is a guaranteed no-op (requirement 5).

/**
 * Resolve the checkout id and the payment/transaction id from a Chargily checkout
 * object. Chargily's `checkout.paid` webhook and GET /checkouts/:id return the same
 * shape; the payment id field name has varied across API revisions, so we accept a
 * few aliases and fall back to the checkout id when no distinct payment id exists.
 */
function resolvePaymentIds(checkout = {}) {
  const checkoutId = checkout.id || null;
  const paymentId =
    checkout.payment_id || checkout.paymentId ||
    checkout.invoice_id || checkout.invoiceId ||
    (Array.isArray(checkout.payments) && checkout.payments[0] && checkout.payments[0].id) ||
    checkoutId;
  return { checkoutId, paymentId };
}

/**
 * Idempotently flip a pending order to paid and create its registration.
 * Returns the registrationId (existing one if the order was already processed).
 */
async function finalizePaidOrder(orderRef, orderId, checkout = {}) {
  const { checkoutId, paymentId } = resolvePaymentIds(checkout);
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Atomically CLAIM the order: only the first caller flips pending→paid and writes
  // the canonical payment fields. Any later webhook/verify sees paid and no-ops.
  const claim = await db.runTransaction(async (t) => {
    const snap = await t.get(orderRef);
    if (!snap.exists) return { order: null, alreadyPaid: false };
    const order = snap.data();
    if (order.paid === true || order.status === 'paid' || order.processedAt) {
      return { order, alreadyPaid: true };
    }
    t.update(orderRef, {
      status:             'paid',
      paid:               true,
      paymentStatus:      'paid',
      paymentMethod:      'chargily',
      paidAt:             now,
      processedAt:        now,
      chargilyCheckoutId: checkoutId || order.chargilyCheckoutId || null,
      chargilyPaymentId:  paymentId  || null,
    });
    return { order, alreadyPaid: false };
  });

  if (!claim.order) {
    console.warn('[chargily] finalizePaidOrder: paymentOrder not found:', orderId);
    return null;
  }
  if (claim.alreadyPaid) return claim.order.registrationId || null;

  const registrationId = await createRegistrationFromOrder(
    {
      ...claim.order,
      paymentMethod:      'chargily',
      chargilyCheckoutId: checkoutId || claim.order.chargilyCheckoutId || null,
      chargilyPaymentId:  paymentId  || null,
    },
    orderId
  );
  if (registrationId) await orderRef.update({ registrationId });
  return registrationId;
}

// ─── Get Order Status ─────────────────────────────────────────────────────────

async function getOrderStatus(req, res) {
  try {
    const { orderId } = req.params;
    const orderSnap = await db.collection('paymentOrders').doc(orderId).get();

    if (!orderSnap.exists) {
      return res.status(404).json({ code: 'not-found', message: 'الطلب غير موجود.' });
    }

    const order = orderSnap.data();

    // Only the owning student may view via this route. This project stores staff
    // status in Firestore (admins/owners collections), NOT in Firebase custom
    // claims, so req.user is the raw decoded token and carries no `role` — the old
    // `req.user.role` staff bypass was always undefined and thus dead. Admins/owners
    // read payment orders through GET /api/chargily/orders (requireAdmin) instead.
    if (order.studentId !== req.user.uid) {
      return res.status(403).json({ code: 'forbidden' });
    }

    return res.json({
      orderId,
      status:         order.status,
      paid:           order.paid === true || order.status === 'paid',
      paymentStatus:  order.paymentStatus || (order.status === 'paid' ? 'paid' : order.status),
      serviceType:    order.serviceType,
      amount:         order.amount,
      currency:       order.currency,
      paymentMethod:  order.paymentMethod,
      chargilyCheckoutId: order.chargilyCheckoutId || null,
      chargilyPaymentId:  order.chargilyPaymentId  || null,
      registrationId: order.registrationId,
      paidAt:         order.paidAt,
      serviceData:    order.serviceData,
    });

  } catch (err) {
    console.error('[chargily] getOrderStatus error:', err.message);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ─── Verify & Process (fallback when webhook was missed) ─────────────────────

async function verifyAndProcess(req, res) {
  try {
    const { orderId } = req.params;
    const orderRef  = db.collection('paymentOrders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ code: 'not-found' });
    }

    const order = orderSnap.data();

    if (order.studentId !== req.user.uid) {
      return res.status(403).json({ code: 'forbidden' });
    }

    // Already confirmed (e.g. the webhook won the race) — report paid immediately.
    if (order.paid === true || order.status === 'paid') {
      return res.json({ status: 'paid', registrationId: order.registrationId });
    }

    if (!order.chargilyCheckoutId) {
      return res.json({ status: order.status });
    }

    const checkout = await chargilyService.getCheckout(order.chargilyCheckoutId);

    if (checkout.status === 'paid') {
      // Same atomic, idempotent path as the webhook — races are safe.
      const registrationId = await finalizePaidOrder(orderRef, orderId, checkout);
      return res.json({ status: 'paid', registrationId });
    }

    if (checkout.status === 'failed') {
      await orderRef.update({ status: 'failed', paymentStatus: 'failed' });
      return res.json({ status: 'failed' });
    }

    return res.json({ status: checkout.status });

  } catch (err) {
    console.error('[chargily] verifyAndProcess error:', err.message);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// NOTE: POST /api/chargily/cash (recordCashPayment) used to live here. It was a
// second, never-called implementation of "admin records an in-school payment",
// parallel to the admin-add / admin-create endpoints the UI actually uses. Two
// code paths for the same business event is how enforcement rules drift apart,
// so the unused one is gone. Cash collected at the desk now reaches the payment
// log from the real admin paths via services/paymentOrderLog.js.

// ─── Admin: List Payment Orders ───────────────────────────────────────────────

async function listOrders(req, res) {
  try {
    const { branchId, status, needsAttention, limit: lim = 200 } = req.query;
    const maxResults = Math.min(parseInt(lim) || 200, 500);

    // Branch isolation: an admin may ONLY see their own branch's orders. The
    // client-supplied branchId is ignored — the admin's bound branch (set by
    // requireAdmin) is authoritative, so omitting branchId can't leak other
    // branches. (Falls back to an explicit branchId only if no admin binding,
    // e.g. a future owner route.)
    const scope = req.adminBranchId || branchId || null;

    let base = db.collection('paymentOrders');
    if (scope) base = base.where('branchId', '==', scope);

    // `needsAttention` is the paid-but-unseated triage queue; it is intentionally
    // NOT combined with a status filter (such an order is always `paid`).
    if (needsAttention === 'true') {
      base = base.where('needsAttention', '==', true);
    } else if (status) {
      base = base.where('status', '==', status);
    }

    // Two equality filters PLUS orderBy needs a composite index (branchId+status
    // +createdAt / branchId+needsAttention+createdAt — both are declared in
    // firestore.indexes.json). Until those finish building, Firestore answers
    // FAILED_PRECONDITION and the admin would just see a 500 with a console URL.
    // Fall back to the same equality-only query without the sort and order in
    // memory: identical result set, one extra sort, and the page keeps working.
    let snap;
    try {
      snap = await base.orderBy('createdAt', 'desc').limit(maxResults).get();
    } catch (err) {
      if (err.code !== 9 /* FAILED_PRECONDITION */) throw err;
      console.warn('[chargily] listOrders: composite index missing, sorting in memory. Deploy firestore.indexes.json.');
      snap = await base.limit(maxResults).get();
    }

    const orders = snap.docs
      .map(d => ({ orderId: d.id, ...d.data() }))
      .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

    // Summary over the WHOLE branch scope, not just the returned page/filter, so
    // the UI's headline numbers never contradict the filter the admin picked.
    // (Aggregation queries stream no documents.)
    let summary = null;
    if (scope) {
      const base = db.collection('paymentOrders').where('branchId', '==', scope);
      const countOf = async (q) => {
        try { return (await q.count().get()).data().count || 0; } catch { return 0; }
      };
      const [total, paid, pending, failed, attention] = await Promise.all([
        countOf(base),
        countOf(base.where('status', '==', 'paid')),
        countOf(base.where('status', '==', 'pending_payment')),
        countOf(base.where('status', '==', 'failed')),
        countOf(base.where('needsAttention', '==', true)),
      ]);
      summary = { total, paid, pending, failed, needsAttention: attention };
    }

    return res.json({ orders, summary, truncated: snap.size >= maxResults });

  } catch (err) {
    console.error('[chargily] listOrders error:', err.message);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ─── Registration Factory ─────────────────────────────────────────────────────

async function createRegistrationFromOrder(order, orderId) {
  const { studentId, studentName, studentEmail, branchId, serviceType, serviceData, amount, paymentMethod, chargilyCheckoutId, chargilyPaymentId } = order;
  const ctx = {
    studentId, studentName, studentEmail, branchId,
    serviceData: serviceData || {}, amount: amount || 0, orderId,
    paymentMethod: paymentMethod || 'chargily',
    chargilyCheckoutId: chargilyCheckoutId || null,
    chargilyPaymentId:  chargilyPaymentId  || null,
  };

  try {
    switch (serviceType) {
      case 'language':  return await _createLanguageReg(ctx);
      case 'training':  return await _createTrainingReg(ctx);
      case 'support':   return await _createSupportReg(ctx);
      case 'annualFee': return await _createAnnualFeeReg(ctx);
      default:
        console.warn('[chargily] Unknown serviceType:', serviceType);
        return null;
    }
  } catch (err) {
    // The student ALREADY paid but we could not seat them (full class, duplicate,
    // schedule conflict, support-eligibility, etc.). Never silently drop a paid
    // enrollment — flag the order so an admin can refund / resolve it.
    console.error(`[chargily] createRegistration(${serviceType}) error:`, err._code || err.message);
    try {
      await db.collection('paymentOrders').doc(orderId).update({
        registrationStatus: 'failed',
        registrationError:  err._code || err.message || 'unknown',
        needsAttention:     true,
        updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e2) { console.error('[chargily] failed to flag order:', e2.message); }
    return null;
  }
}

// Canonical "this record is paid" fields, stamped on every registration document
// so the frontend can gate the Pay button off a single, uniform signal
// (paymentStatus === 'paid' / paid === true) regardless of service type or channel.
function paymentFields({ paymentMethod, chargilyCheckoutId, chargilyPaymentId, now }) {
  return {
    paid:               true,
    paymentStatus:      'paid',
    paidAt:             now,
    paymentMethod:      paymentMethod || 'chargily',
    chargilyCheckoutId: chargilyCheckoutId || null,
    chargilyPaymentId:  chargilyPaymentId  || null,
  };
}

// ─── Language Registration ────────────────────────────────────────────────────

async function _createLanguageReg({ studentId, studentName, studentEmail, branchId, serviceData: sd, amount, orderId, paymentMethod, chargilyCheckoutId, chargilyPaymentId }) {
  const now     = admin.firestore.FieldValue.serverTimestamp();
  const classId = sd.classId || null;

  // The order amount is already authoritative — createCheckout resolves it from the
  // class catalog server-side for online payments (admin-set for cash). We still
  // load the class for capacity + schedules.
  const price = Number(amount) || 0;
  let classData = null;
  if (classId) {
    const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
    if (clsSnap.exists) classData = clsSnap.data() || {};
  }
  const schedules = sd.schedules || (classData && classData.schedules) || [];

  // Schedule-conflict gate (mirrors academicController.verifyLanguage).
  await assertNoStudentConflict(branchId, studentId, schedules, { excludeClassId: classId, studentName: studentName || '' });

  const colReg   = db.collection('branches').doc(branchId).collection('languagesRegistered');
  const regId    = colReg.doc().id;
  const regRef   = colReg.doc(regId);
  const formRef  = db.collection('branches').doc(branchId)
    .collection('languagesForms').doc(studentId).collection('languageFormEntries').doc(regId);
  const userRef  = db.collection('branches').doc(branchId).collection('users').doc(studentId);
  // Only treat the class as real when its doc EXISTS — otherwise a t.update on a
  // missing classRef would throw and fail the (already-paid) registration.
  const classRef = classData ? db.collection('branches').doc(branchId).collection('classes').doc(classId) : null;

  const base = {
    userId: studentId, userEmail: studentEmail || '', studentName: studentName || '',
    classId, subjectId: sd.subjectId || sd.languageId || null,
    subjectName: sd.subjectName || sd.languageName || '',
    languageId: sd.languageId || sd.subjectId || null,
    languageName: sd.languageName || sd.subjectName || '',
    levelId: sd.levelId || null, levelLabel: sd.levelLabel || '',
    groupName: sd.groupName || '', teacherName: sd.teacherName || '',
    schedules, languagePrice: price, levelPrice: price,
    birthDate: sd.birthDate || null, birthPlace: sd.birthPlace || '',
    school: normalizeSchool(sd.school),
    guardianPhone: sd.guardianPhone || '', studentPhone: sd.studentPhone || '',
    paymentMethod, paymentOrderId: orderId, branchId,
    ...paymentFields({ paymentMethod, chargilyCheckoutId, chargilyPaymentId, now }),
  };

  // Transactional capacity + duplicate gate; write the canonical archive, the
  // student's form entry, the user summary, and bump enrollmentCount atomically.
  await db.runTransaction(async (t) => {
    if (classRef) assertCapacityInTx(await t.get(classRef));
    if (classId || (base.languageId && base.levelId)) {
      const dupQ = (base.languageId && base.levelId)
        ? colReg.where('userId', '==', studentId).where('languageId', '==', base.languageId).where('levelId', '==', base.levelId).limit(1)
        : colReg.where('userId', '==', studentId).where('classId', '==', classId).limit(1);
      const dup = await t.get(dupQ);
      if (!dup.empty) { const e = new Error('duplicate'); e._code = 'duplicate-registration'; throw e; }
    }
    t.set(regRef,  { ...base, formId: regId, status: 'registered', visibility: 'approved', verified: true, registeredAt: now, verifiedAt: now, createdAt: now });
    t.set(formRef, { ...base, status: 'approved', visibility: 'approved', verified: true, verifiedAt: now, createdAt: now });
    t.set(userRef, {
      'registrations.language': true,
      'registrations.languages': admin.firestore.FieldValue.arrayUnion({ formId: regId, languageName: base.languageName, levelLabel: base.levelLabel, registeredAt: Date.now(), verifiedBy: 'system' }),
      updatedAt: now,
    }, { merge: true });
    if (classRef) t.update(classRef, { enrollmentCount: admin.firestore.FieldValue.increment(1), updatedAt: now });
  });

  // Ledger + audit (recordRegistrationRevenue writes BOTH, matching the admin path).
  await recordRegistrationRevenue({
    branchId, serviceType: 'language',
    sourceCollection: 'languagesRegistered', sourceDocId: regId,
    regData: base, classId, amount: price,
    actor: { uid: 'system', role: 'system' },
  });

  return regId;
}

// ─── Training Registration ────────────────────────────────────────────────────

async function _createTrainingReg({ studentId, studentName, studentEmail, branchId, serviceData: sd, amount, orderId, paymentMethod, chargilyCheckoutId, chargilyPaymentId }) {
  const now        = admin.firestore.FieldValue.serverTimestamp();
  const classId    = sd.classId || null;
  const trainingId = sd.trainingId || sd.subjectId || null;

  const price = Number(amount) || 0;
  let classData = null;
  if (classId) {
    const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
    if (clsSnap.exists) classData = clsSnap.data() || {};
  }
  const schedules = sd.schedules || (classData && classData.schedules) || [];
  const trainingName = sd.trainingName || sd.subjectName || '';

  // Schedule-conflict gate (mirrors academicController.verifyTraining).
  await assertNoStudentConflict(branchId, studentId, schedules, { excludeClassId: classId, studentName: studentName || '' });

  const colReg   = db.collection('branches').doc(branchId).collection('trainingsRegistered');
  const regId    = colReg.doc().id;
  const regRef   = colReg.doc(regId);
  const formRef  = db.collection('branches').doc(branchId)
    .collection('trainingsForms').doc(studentId).collection('trainingFormEntries').doc(regId);
  const userRef  = db.collection('branches').doc(branchId).collection('users').doc(studentId);
  // Only treat the class as real when its doc EXISTS (training may be class-less).
  const classRef = classData ? db.collection('branches').doc(branchId).collection('classes').doc(classId) : null;

  const base = {
    userId: studentId, userEmail: studentEmail || '', studentName: studentName || '',
    trainingId, trainingName, trainingTitle: trainingName,
    classId, subjectId: sd.subjectId || null, subjectName: sd.subjectName || '',
    groupName: sd.groupName || '', teacherName: sd.teacherName || '',
    schedule: sd.schedule || null, schedules,
    price, trainingPrice: price,
    birthDate: sd.birthDate || null, birthPlace: sd.birthPlace || '',
    school: normalizeSchool(sd.school), studentPhone: sd.studentPhone || '',
    paymentMethod, paymentOrderId: orderId, branchId,
    ...paymentFields({ paymentMethod, chargilyCheckoutId, chargilyPaymentId, now }),
  };

  await db.runTransaction(async (t) => {
    if (classRef) assertCapacityInTx(await t.get(classRef));
    if (trainingId) {
      const dup = await t.get(colReg.where('userId', '==', studentId).where('trainingId', '==', trainingId).limit(1));
      if (!dup.empty) { const e = new Error('duplicate'); e._code = 'duplicate-registration'; throw e; }
    }
    t.set(regRef,  { ...base, registrationId: regId, formId: regId, name: trainingName, status: 'approved', registeredAt: now, verifiedAt: now, createdAt: now });
    t.set(formRef, { ...base, status: 'approved', verified: true, verifiedAt: now, createdAt: now });
    t.set(userRef, {
      'registrations.trainings': admin.firestore.FieldValue.arrayUnion({ registrationId: regId, formId: regId, trainingId: trainingId || regId, name: trainingName, title: trainingName, price, status: 'approved', registeredAt: Date.now(), verifiedAt: Date.now() }),
      updatedAt: now,
    }, { merge: true });
    if (classRef) t.update(classRef, { enrollmentCount: admin.firestore.FieldValue.increment(1), updatedAt: now });
  });

  await recordRegistrationRevenue({
    branchId, serviceType: 'training',
    sourceCollection: 'trainingsRegistered', sourceDocId: regId,
    regData: base, classId, amount: price,
    actor: { uid: 'system', role: 'system' },
  });

  return regId;
}

// ─── Support Lesson Registration ──────────────────────────────────────────────

async function _createSupportReg({ studentId, studentName, studentEmail, branchId, serviceData: sd, amount, orderId, paymentMethod, chargilyCheckoutId, chargilyPaymentId }) {
  const now     = admin.firestore.FieldValue.serverTimestamp();
  const classId = sd.classId || null;
  if (!classId) { const e = new Error('missing-class'); e._code = 'missing-class'; throw e; }

  // Authoritative class doc drives pricing, schedules, groupType, capacity.
  const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
  if (!clsSnap.exists) { const e = new Error('class-not-found'); e._code = 'class-not-found'; throw e; }
  const classData = { id: clsSnap.id, ...clsSnap.data() };

  // RULE A/B + average gate — recomputed from the student's STORED average; never
  // trusts the client. persist:false: a payment never rewrites the average. Throws
  // on violation (caught by the dispatcher, which flags the paid order).
  const gate = await resolveClassificationAndEnforce({
    branchId, userId: studentId, targetClass: classData, classId, persist: false,
  });

  // Schedule-conflict + duplicate gates (mirror the controller self-enroll path).
  await assertNoStudentConflict(branchId, studentId, classData.schedules || [], { excludeClassId: classId, studentName: studentName || '' });
  if (await hasActiveSupportRegistration(branchId, studentId, classId)) {
    const e = new Error('duplicate'); e._code = 'duplicate-registration'; throw e;
  }

  // Calendar-month cycle + server proration (the order amount may bundle the fee;
  // record only the support portion here).
  const regDate   = new Date();
  const cycleKey  = monthKeyOf(regDate);
  const startDate = startOfMonth(regDate);
  const endDate   = computeCycleEnd(regDate);
  const proration = computeProration(classData, regDate);
  const supportAmt = proration.amountDue;

  const includesAnnualFee = sd.includesAnnualFee === true && !(await isAnnualFeePaidThisYear(branchId, studentId));
  const annualFeeAmount   = includesAnnualFee ? await financeSettings.getAnnualFeeAmount() : 0;

  const regRef = db.collection('supportLessonRegistrations').doc();
  const regId  = regRef.id;

  const doc = {
    branchId, userId: studentId, studentId,
    userName: studentName || '', studentName: studentName || '', userEmail: studentEmail || '',
    school: gate.school,
    lessonId: classId, classId,            // BOTH — capacity/duplicate queries key on lessonId
    subjectId: classData.subjectId || sd.subjectId || null,
    subjectName: classData.subjectName || sd.subjectName || sd.lessonName || '',
    lessonName: classData.subjectName || sd.lessonName || sd.subjectName || '',
    groupName: classData.groupName || sd.groupName || '',
    teacherName: classData.teacherName || sd.teacherName || '',
    schedules: Array.isArray(classData.schedules) ? classData.schedules : [],
    studyYear: classData.studyYear || classData.year || sd.studyYear || '',
    groupType: gate.groupType,
    studentClassification: gate.classification,
    distinguishedSubjectsAverage: gate.average,
    startDate: admin.firestore.Timestamp.fromDate(startDate),
    endDate:   admin.firestore.Timestamp.fromDate(endDate),
    cycleMonthKey: cycleKey,               // canonical key the delete-reversal reads
    durationInMonths: 1,
    monthlyPrice: proration.monthlyPrice || null,
    totalPrice: supportAmt, proratedAmount: supportAmt,
    totalSessionsThisMonth: proration.totalSessions,
    elapsedSessionsAtEnrollment: proration.elapsedSessions,
    remainingSessionsAtEnrollment: proration.remainingSessions,
    pricePerSession: proration.pricePerSession,
    includesAnnualFee, annualFeeAmount,
    paymentMethod, paymentOrderId: orderId,
    source: 'chargily',
    status: 'verified', verifiedAt: now, createdAt: now, updatedAt: now,
    ...paymentFields({ paymentMethod, chargilyCheckoutId, chargilyPaymentId, now }),
  };

  // Transactional capacity gate (count active verified regs for this lesson, then
  // write) — serializes concurrent paid enrollments so capacity can't be exceeded.
  const cap = Number(classData.capacity) || 0;
  await db.runTransaction(async (t) => {
    if (cap > 0) {
      const qs = await t.get(db.collection('supportLessonRegistrations').where('lessonId', '==', classId));
      const nowD = new Date();
      const active = qs.docs.filter((d) => {
        const x = d.data() || {};
        if (x.branchId !== branchId) return false;
        if (String(x.status || '').toLowerCase() !== 'verified') return false;
        const end = x.endDate?.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
        return !end || end > nowD;
      }).length;
      if (active >= cap) { const e = new Error('class-full'); e._code = 'class-full'; throw e; }
    }
    t.set(regRef, doc);
  });

  await recomputeSupportClassEnrollment(branchId, classId);

  // Bundled annual fee (de-duplicated inside _createAnnualFeeReg).
  if (includesAnnualFee) {
    await _createAnnualFeeReg({
      studentId, studentName, studentEmail, branchId,
      serviceData: { level: doc.studyYear, studyYear: doc.studyYear, school: gate.school },
      amount: annualFeeAmount, orderId, paymentMethod,
    }).catch((e) => console.error('[chargily] bundled annual fee error:', e.message));
  }

  // Ledger (support portion only) + audit.
  try {
    await ledger.recordPayment({
      branchId, studentId, studentName,
      serviceType: 'support',
      subjectId: doc.subjectId, subjectName: doc.subjectName,
      classId, className: doc.groupName, teacherName: doc.teacherName,
      amount: supportAmt, period: cycleKey,
      sourceCollection: 'supportLessonRegistrations', sourceDocId: `${regId}_${cycleKey}`,
      recordedBy: { uid: 'system', role: 'system' }, paidAt: new Date(),
    });
    await writeAudit({
      branchId, actor: { uid: 'system', role: 'system' },
      action: 'payment.verify', targetType: 'supportLessonRegistration', targetId: regId,
      after: { status: 'verified', source: 'chargily', amount: supportAmt, period: cycleKey },
    });
  } catch (e) {
    console.error('[chargily] support ledger/audit error:', e.message);
  }

  return regId;
}

// ─── Annual Fee Registration ──────────────────────────────────────────────────

async function _createAnnualFeeReg({ studentId, studentName, studentEmail, branchId, serviceData: sd, amount, orderId, paymentMethod, chargilyCheckoutId, chargilyPaymentId }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const yr  = academicYear.getAcademicYearLabel();

  // Idempotent across ALL paths: at most one verified annual payment per (student,
  // academic year). Catches duplicates from any channel (standalone admin, support
  // bundle, a second Chargily order, or a re-fired webhook).
  if (await isAnnualFeePaidThisYear(branchId, studentId)) {
    console.info(`[chargily] annual fee already paid for ${yr} — skipping duplicate.`);
    return null;
  }

  // Snapshot the owner-configured fee when an explicit amount wasn't supplied.
  const fee   = Number(amount) || await financeSettings.getAnnualFeeAmount();
  // Year-deterministic id so even simultaneous webhooks converge onto ONE doc.
  const payId = `annual_${studentId}_${yr}`;
  const payRef = db.collection('branches').doc(branchId).collection('annualPayments').doc(payId);

  await payRef.set({
    userId:    studentId,
    userName:  studentName || '',
    userEmail: studentEmail || '',
    amount:    fee,
    annualFee: fee,
    year:      yr,
    academicYear: yr,
    level:     sd.level     || sd.studyYear || '',
    school:    normalizeSchool(sd.school),
    stream:    sd.stream    || '',
    studyYear: sd.studyYear || '',
    paymentMethod:  paymentMethod,
    paymentOrderId: orderId,
    status:         'verified',
    // annualPayments keeps its established 'verified' convention (matches the admin
    // path + the frontend's status-based detection); `paid` is the new uniform flag.
    paymentStatus:  'verified',
    paid:           true,
    paidAt:         now,
    chargilyCheckoutId: chargilyCheckoutId || null,
    chargilyPaymentId:  chargilyPaymentId  || null,
    source:         'chargily',
    verifiedAt:     now,
    createdAt:      now,
    updatedAt:      now,
    correctionReason: null,
    rejectionReason:  null,
  }, { merge: true });

  // Propagate the full flag union the owner dashboard + admin views count on.
  try {
    await db.collection('branches').doc(branchId).collection('users').doc(studentId).set({
      annualFeePaid:      true,
      annualFeeYear:      yr,
      annualFeePaymentId: payId,
      yearlyFeePaid:      true,
      paymentVerified:    true,
      updatedAt:          now,
    }, { merge: true });
  } catch (e) {
    console.error('[chargily] annual fee user update error:', e.message);
  }

  try {
    await ledger.recordPayment({
      branchId,
      studentId,
      studentName,
      serviceType:  'annualFee',
      amount:       fee,
      period:       yr,
      // Deterministic source id (matches the support-verify path) so re-runs and
      // the backfill never double-count this entry.
      sourceCollection: 'annualPayments',
      sourceDocId:  payId,
      recordedBy:   { uid: 'system', role: 'system' },
      paidAt:       new Date(),
    });
    await writeAudit({
      branchId, actor: { uid: 'system', role: 'system' },
      action: 'payment.verify', targetType: 'annualFee', targetId: payId,
      after: { status: 'verified', source: 'chargily', amount: fee, academicYear: yr },
    });
  } catch (e) {
    console.error('[chargily] annual fee ledger/audit error:', e.message);
  }

  return payId;
}

module.exports = {
  createCheckout,
  handleWebhook,
  getOrderStatus,
  verifyAndProcess,
  listOrders,
};
