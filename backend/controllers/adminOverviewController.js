/**
 * adminOverviewController.js
 * --------------------------
 * The branch administrator's "what needs me today" snapshot, computed
 * server-side with the Admin SDK in one round-trip.
 *
 * WHY THIS EXISTS
 * The previous Overview page fired ~21 client-side aggregation queries that
 * counted the OLD receipt-upload workflow: "payments awaiting verification",
 * "annual fees pending / rejected". After the Chargily migration those queues
 * cannot exist — a registration document is only ever written once money has
 * actually been captured (see chargilyController.createRegistrationFromOrder),
 * so every registration an admin can see is already paid. Counting `status ==
 * 'pending'` therefore reported stale legacy rows as live work.
 *
 * What an admin actually owns each day, and what this endpoint returns:
 *   1. actionRequired.documentVerification — students who uploaded ID/photo and
 *      are waiting on a human accept/reject decision. The ONE real approval queue.
 *   2. actionRequired.stuckPayments — orders where the student PAID but the
 *      registration could not be created (full class, duplicate, schedule
 *      conflict, ineligible support level). Money is held with no seat granted.
 *      chargilyController already flags these `needsAttention: true`; until now
 *      nothing in the product ever showed them.
 *   3. actionRequired.trainingRequests — un-triaged custom-training leads.
 *   4. attention.expiringSupport — support subscriptions ending within 7 days
 *      (support is billed per calendar month, so this is the renewal worklist).
 *   5. today / month revenue actually captured, from paymentOrders.
 *   6. catalog — subjects / classes / capacity pressure for the branch.
 *
 * Branch isolation: requireAdmin resolves req.adminBranchId from the `admins`
 * collection and rejects any request whose branchId differs, so every query
 * below is pinned to the caller's own branch.
 */

const { admin, db } = require('../config/firebase');
const academicYear = require('../services/academicYear');
const { writeAudit } = require('../services/auditService');

const DAY_MS = 24 * 60 * 60 * 1000;

// Training-interest statuses that are NOT "un-triaged" — kept in lockstep with
// normalizeStatus() in src/utils/trainingRequests.js. Anything NOT in this set
// (incl. '', a missing status field, 'جديد', 'pending', or any unknown value)
// normalizes to NEW, so the sidebar badge counts (total − resolved) instead of an
// exact status=='new' match that would silently drop legacy / blank leads.
const RESOLVED_TRAINING_STATUSES = [
  // contacted
  'contacted', 'reviewing', 'reviewed', 'review', 'in_review', 'قيد المراجعة', 'تم التواصل',
  // following_up
  'following_up', 'followup', 'follow_up', 'قيد المتابعة',
  // closed
  'closed', 'rejected', 'declined', 'cancelled', 'مغلق', 'مرفوض',
  'enrolled', 'registered', 'completed', 'accepted', 'approved', 'مكتمل', 'مسجل', 'تم التسجيل',
];

/** Count a query without streaming documents. */
async function countOf(query) {
  try {
    const snap = await query.count().get();
    return snap.data().count || 0;
  } catch (err) {
    // count() needs no index, but a malformed/unsupported query must not take
    // down the whole overview — report 0 and keep the other panels alive.
    console.warn('[admin/overview] count failed:', err.message);
    return 0;
  }
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try { return value.toDate(); } catch { return null; }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Support-subscription snapshot: how many are live, how many lapsed, and which
 * lapse within the week.
 *
 * FAST PATH — three narrow queries served by the (branchId, status, endDate)
 * composite index. This endpoint is polled by every open admin session, so it
 * must not read the branch's entire subscription history: that set grows every
 * month, forever.
 *
 * FALLBACK — until that index finishes building, Firestore answers
 * FAILED_PRECONDITION. Rather than fail the whole overview over one panel, read
 * the (bounded) verified set and bucket it in memory. Same numbers, more reads.
 *
 * @returns {Promise<{active:number, expired:number, expiring:Array}>}
 */
async function loadSupportSnapshot(branchId, now, soon) {
  const base = db.collection('supportLessonRegistrations')
    .where('branchId', '==', branchId)
    // Only `verified` rows are real subscriptions. Anything else is a leftover
    // from the deleted receipt-approval workflow and is not live work.
    .where('status', '==', 'verified');

  const toRow = (doc) => {
    const r = doc.data() || {};
    return {
      id:          doc.id,
      studentName: r.studentName || r.userName || '',
      subjectName: r.subjectName || r.lessonName || '',
      groupName:   r.groupName || '',
      endDate:     r.endDate || null,
    };
  };

  const nowTs  = admin.firestore.Timestamp.fromDate(now);
  const soonTs = admin.firestore.Timestamp.fromDate(soon);

  try {
    const [activeIncl, expired, reserved, expiringSnap] = await Promise.all([
      base.where('endDate', '>', nowTs).count().get().then((s) => s.data().count || 0),
      base.where('endDate', '<=', nowTs).count().get().then((s) => s.data().count || 0),
      // RESERVED = verified but not yet begun (Group Start Month ahead). All
      // equality filters → served by index merging, so no new composite index;
      // a missing index degrades gracefully to 0 rather than failing the panel.
      base.where('reserved', '==', true).count().get().then((s) => s.data().count || 0).catch(() => 0),
      // Ordered ascending so the soonest to lapse — the ones worth calling first —
      // lead the list. Capped at the number the UI actually shows.
      base.where('endDate', '>', nowTs).where('endDate', '<=', soonTs)
        .orderBy('endDate', 'asc').limit(25).get(),
    ]);
    // A reservation's endDate is a future month, so it sits inside activeIncl —
    // but it is NOT studying yet. Exclude reserved from the active headline and
    // from the renewal (expiring) worklist.
    const active = Math.max(0, activeIncl - reserved);
    const expiring = expiringSnap.docs.filter((d) => (d.data() || {}).reserved !== true).map(toRow);
    return { active, reserved, expired, expiring };
  } catch (err) {
    if (err.code !== 9 /* FAILED_PRECONDITION */) throw err;
    console.warn('[admin/overview] support index missing, bucketing in memory. Deploy firestore.indexes.json.');

    const snap = await base.limit(5000).get();
    let active = 0, expired = 0, reserved = 0;
    const expiring = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      // Reserved subscriptions are neither active nor expired for the headline.
      if (data.reserved === true) { reserved += 1; continue; }
      const end = toDate(data.endDate);
      // A subscription with no end date can't have lapsed — treat it as live.
      if (!end) { active += 1; continue; }
      if (end <= now) { expired += 1; continue; }
      active += 1;
      if (end <= soon) expiring.push(toRow(doc));
    }
    expiring.sort((a, b) => (toDate(a.endDate)?.getTime() || 0) - (toDate(b.endDate)?.getTime() || 0));
    return { active, reserved, expired, expiring: expiring.slice(0, 25) };
  }
}

/**
 * GET /api/admin/overview
 *
 * Response shape is intentionally flat and pre-labelled so the UI does no
 * business arithmetic of its own — the numbers an admin acts on are decided
 * in exactly one place.
 */
const getOverview = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId;
    if (!branchId) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }

    const branchRef   = db.collection('branches').doc(branchId);
    const usersRef    = branchRef.collection('users');
    const subjectsRef = branchRef.collection('subjects');
    const classesRef  = branchRef.collection('classes');
    const regsRef     = branchRef.collection('registrations');
    const ordersRef   = db.collection('paymentOrders').where('branchId', '==', branchId);

    const todayStart = startOfToday();
    const monthStart = startOfThisMonth();
    const yearLabel  = academicYear.getAcademicYearLabel();
    const now  = new Date();
    const soon = new Date(now.getTime() + 7 * DAY_MS);

    const [
      studentsTotal,
      studentsPendingDocs,
      studentsVerified,
      trainingRequestsPending,
      subjectsLanguage,
      subjectsSupport,
      subjectsTraining,
      annualFeesThisYear,
      stuckOrdersSnap,
      recentOrdersSnap,
      classesSnap,
      support,
    ] = await Promise.all([
      countOf(usersRef),
      countOf(usersRef.where('verificationStatus', '==', 'pending')),
      countOf(usersRef.where('verificationStatus', '==', 'verified')),
      // Un-triaged training-interest leads — everything normalizeStatus() treats as
      // NEW (awaiting first contact): total training_request docs minus the resolved
      // set. Matches the admin page's «جديدة» count and catches legacy/blank/missing-
      // status leads that an exact status=='new' query would silently drop.
      (async () => {
        const base = regsRef.where('type', '==', 'training_request');
        const [total, resolved] = await Promise.all([
          countOf(base),
          countOf(base.where('status', 'in', RESOLVED_TRAINING_STATUSES)),
        ]);
        return Math.max(0, total - resolved);
      })(),
      countOf(subjectsRef.where('serviceType', '==', 'language')),
      countOf(subjectsRef.where('serviceType', '==', 'support')),
      countOf(subjectsRef.where('serviceType', '==', 'training')),
      countOf(branchRef.collection('annualPayments').where('academicYear', '==', yearLabel)),

      // Paid but not seated. Branch-scoped at the query level (composite index
      // branchId+needsAttention ships in firestore.indexes.json) so one busy
      // branch can never crowd another out of the result window.
      ordersRef.where('needsAttention', '==', true).limit(100).get(),

      // Revenue actually captured. Ordering by createdAt with an equality filter
      // on branchId resolves via the automatic single-field index.
      ordersRef.orderBy('createdAt', 'desc').limit(300).get(),

      classesRef.get(),
      loadSupportSnapshot(branchId, now, soon),
    ]);

    // ── Stuck payments (money captured, seat not granted) ────────────────────
    const stuckPayments = stuckOrdersSnap.docs
      .map((d) => ({ orderId: d.id, ...d.data() }))
      .map((o) => ({
        orderId:      o.orderId,
        studentName:  o.studentName || '',
        studentEmail: o.studentEmail || '',
        serviceType:  o.serviceType || '',
        amount:       Number(o.amount) || 0,
        reason:       o.registrationError || 'unknown',
        paidAt:       o.paidAt || o.createdAt || null,
      }));

    // ── Revenue ─────────────────────────────────────────────────────────────
    let revenueToday = 0;
    let revenueMonth = 0;
    let paidToday    = 0;
    let awaitingPayment = 0;
    for (const doc of recentOrdersSnap.docs) {
      const o = doc.data() || {};
      if (o.status === 'pending_payment') { awaitingPayment += 1; continue; }
      if (o.status !== 'paid') continue;
      const when = toDate(o.paidAt) || toDate(o.createdAt);
      if (!when) continue;
      const amount = Number(o.amount) || 0;
      if (when >= monthStart) revenueMonth += amount;
      if (when >= todayStart) { revenueToday += amount; paidToday += 1; }
    }

    // ── Capacity pressure ───────────────────────────────────────────────────
    let classesTotal = 0;
    let classesFull  = 0;
    let seatsFree    = 0;
    for (const doc of classesSnap.docs) {
      const c = doc.data() || {};
      classesTotal += 1;
      const cap = Number(c.capacity) || 0;
      const enrolled = Number(c.enrollmentCount) || 0;
      if (cap > 0) {
        if (enrolled >= cap) classesFull += 1;
        else seatsFree += cap - enrolled;
      }
    }


    return res.json({
      branchId,
      academicYear: yearLabel,
      generatedAt:  new Date().toISOString(),

      actionRequired: {
        documentVerification: studentsPendingDocs,
        stuckPayments:        stuckPayments.length,
        trainingRequests:     trainingRequestsPending,
        total: studentsPendingDocs + stuckPayments.length + trainingRequestsPending,
      },

      stuckPaymentsList: stuckPayments.slice(0, 10),

      students: {
        total:      studentsTotal,
        verified:   studentsVerified,
        pendingDocs: studentsPendingDocs,
        // Anything neither verified nor pending: rejected, or still confirming
        // their email address. Reported so the three buckets always sum to total.
        other: Math.max(0, studentsTotal - studentsVerified - studentsPendingDocs),
      },

      revenue: {
        today:           revenueToday,
        month:           revenueMonth,
        paidOrdersToday: paidToday,
        awaitingPayment,          // checkouts opened but never completed
        window:          recentOrdersSnap.size,
      },

      support: {
        active:       support.active,
        reserved:     support.reserved || 0,
        expiringSoon: support.expiring.length,
        expired:      support.expired,
        expiringList: support.expiring.slice(0, 10),
      },

      catalog: {
        subjects: {
          language: subjectsLanguage,
          support:  subjectsSupport,
          training: subjectsTraining,
        },
        classes:     classesTotal,
        classesFull,
        seatsFree,
      },

      annualFees: {
        paidThisYear: annualFeesThisYear,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/payment-orders/:orderId/resolve
 *
 * Clears the needsAttention flag once an admin has dealt with a paid-but-unseated
 * order out-of-band (seated the student manually, refunded, or moved them to a
 * different group). This never touches money or the ledger — it only closes the
 * operational alert and records WHO closed it and WHY, so the triage list can
 * reach zero without the underlying payment history being edited.
 */
const resolveStuckOrder = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId;
    const { orderId } = req.params;
    const note = String(req.body?.note || '').trim().slice(0, 500);

    if (!orderId) {
      return res.status(400).json({ code: 'invalid-argument', message: 'orderId is required.' });
    }

    const ref  = db.collection('paymentOrders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ code: 'not-found', message: 'الطلب غير موجود.' });
    }

    const order = snap.data() || {};
    if (order.branchId !== branchId) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }
    if (order.needsAttention !== true) {
      return res.status(409).json({ code: 'not-flagged', message: 'هذا الطلب لا يحتاج إلى تدخل.' });
    }

    const resolvedBy = {
      uid:   req.user.uid,
      email: req.user.email || '',
    };
    const now = admin.firestore.FieldValue.serverTimestamp();

    await ref.update({
      needsAttention: false,
      resolvedAt:     now,
      resolvedBy,
      resolutionNote: note || null,
      updatedAt:      now,
    });

    await writeAudit({
      branchId,
      actor: { ...resolvedBy, role: 'admin' },
      action: 'payment.resolve',
      targetType: 'paymentOrder',
      targetId: orderId,
      before: { needsAttention: true, registrationError: order.registrationError || null },
      after:  { needsAttention: false, resolutionNote: note || null },
    });

    return res.json({ orderId, resolved: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOverview, resolveStuckOrder };
