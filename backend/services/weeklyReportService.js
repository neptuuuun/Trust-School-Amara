/**
 * weeklyReportService.js
 * ----------------------
 * Builds the owner's automated WEEKLY executive report — a cross-branch summary
 * of the last 7 days, computed with the Admin SDK.
 *
 * Revenue is taken from the `ledger` collection (the SSOT for actual revenue,
 * same as ownerController), payments/popular-courses are derived from the same
 * one ledger read, and student/verification counts use count() aggregates (cheap,
 * no doc reads). Pending payments, stuck payments and new reservations come from
 * paymentOrders / supportLessonRegistrations.
 *
 * generateWeeklyReport({ persist }) is called both by the weekly cron (persist:
 * true → writes to `ownerReports/{weekStart}`) and, on demand, by the owner
 * endpoint when no report exists yet. All timestamps are stored as ISO strings so
 * the stored doc is directly consumable by the frontend.
 */

const { admin, db } = require('../config/firebase');

const Timestamp = admin.firestore.Timestamp;
const BRANCHES = ['boumerdes', 'bordj_menaiel'];
const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };
const SERVICE_LABELS = { language: 'اللغات', support: 'دروس الدعم', training: 'الدورات التكوينية', annualFee: 'الرسوم السنوية', annual_fee: 'الرسوم السنوية' };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const iso = (d) => (d instanceof Date ? d.toISOString() : null);

async function safeCount(query) {
  try { return (await query.count().get()).data().count || 0; } catch { return 0; }
}

function tsToDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') { try { return v.toDate(); } catch { return null; } }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compute the weekly report object.
 * @param {{ persist?: boolean, now?: Date }} [opts]
 * @returns {Promise<object>} the report (also written to Firestore when persist)
 */
async function generateWeeklyReport({ persist = false, now = new Date() } = {}) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startTs = Timestamp.fromDate(weekAgo);
  const endTs = Timestamp.fromDate(now);

  const branchDocs = {};
  try {
    (await db.collection('branches').get()).docs.forEach((d) => { branchDocs[d.id] = d.data(); });
  } catch { /* fall back to constant names */ }

  // ── One ledger read powers revenue + payments + popular courses ─────────────
  let ledger = [];
  try {
    const snap = await db.collection('ledger')
      .where('paidAt', '>=', startTs)
      .where('paidAt', '<', endTs)
      .get();
    ledger = snap.docs.map((d) => d.data());
  } catch (e) {
    console.warn('[weeklyReport] ledger read failed:', e.message);
  }

  const revenueByBranch = {};
  const paymentsByBranch = {};
  const courseMap = new Map();
  let revenue = 0;
  for (const e of ledger) {
    const amt = num(e.amount);
    revenue += amt;
    const b = e.branchId || 'unknown';
    revenueByBranch[b] = (revenueByBranch[b] || 0) + amt;
    paymentsByBranch[b] = (paymentsByBranch[b] || 0) + 1;

    const key = e.subjectName || SERVICE_LABELS[e.serviceType] || e.serviceType || 'أخرى';
    const c = courseMap.get(key) || { name: key, serviceType: e.serviceType || '', label: SERVICE_LABELS[e.serviceType] || e.serviceType || '', count: 0, revenue: 0 };
    c.count += 1;
    c.revenue += amt;
    courseMap.set(key, c);
  }
  const paymentsReceived = ledger.length;
  const popularCourses = [...courseMap.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue).slice(0, 6);

  // ── Per-branch student + verification counts (count aggregates) ─────────────
  const branchRows = await Promise.all(BRANCHES.map(async (b) => {
    const usersRef = db.collection('branches').doc(b).collection('users');
    const [newStudents, pendingVerifications] = await Promise.all([
      safeCount(usersRef.where('createdAt', '>=', startTs).where('createdAt', '<', endTs)),
      safeCount(usersRef.where('verificationStatus', '==', 'pending')),
    ]);
    return {
      branchId: b,
      name: branchDocs[b]?.name || BRANCH_NAMES[b] || b,
      revenue: revenueByBranch[b] || 0,
      paymentsReceived: paymentsByBranch[b] || 0,
      newStudents,
      pendingVerifications,
    };
  }));

  const newStudents = branchRows.reduce((a, x) => a + x.newStudents, 0);
  const pendingVerifications = branchRows.reduce((a, x) => a + x.pendingVerifications, 0);

  // ── Pending + stuck payments (paymentOrders) ────────────────────────────────
  let pendingPayments = { count: 0, amount: 0 };
  let stuckPayments = 0;
  try {
    const pendingSnap = await db.collection('paymentOrders').where('status', '==', 'pending_payment').limit(1000).get();
    pendingPayments = pendingSnap.docs.reduce(
      (acc, d) => ({ count: acc.count + 1, amount: acc.amount + num(d.data().amount) }),
      { count: 0, amount: 0 }
    );
  } catch (e) { console.warn('[weeklyReport] pending payments failed:', e.message); }
  stuckPayments = await safeCount(db.collection('paymentOrders').where('needsAttention', '==', true));

  // ── New reservations in the window (support) ────────────────────────────────
  let newReservations = 0;
  try {
    const resSnap = await db.collection('supportLessonRegistrations').where('reserved', '==', true).limit(2000).get();
    newReservations = resSnap.docs.filter((d) => {
      const created = tsToDate(d.data().createdAt);
      return created && created >= weekAgo && created < now;
    }).length;
  } catch (e) { console.warn('[weeklyReport] reservations failed:', e.message); }

  // ── Alerts (actionable) ─────────────────────────────────────────────────────
  const alerts = [];
  if (stuckPayments > 0) {
    alerts.push({ severity: 'danger', title: 'مدفوعات عالقة', detail: `${stuckPayments} عملية دفع مكتملة دون تسجيل مقعد — تحتاج تدخلاً يدوياً.` });
  }
  if (pendingVerifications > 0) {
    alerts.push({ severity: 'warning', title: 'وثائق بانتظار المراجعة', detail: `${pendingVerifications} طالب بانتظار مراجعة وثائقه عبر الفروع.` });
  }
  branchRows.forEach((b) => {
    if (b.revenue === 0 && b.paymentsReceived === 0) {
      alerts.push({ severity: 'warning', title: `لا إيرادات هذا الأسبوع — ${b.name}`, detail: 'لم يُسجَّل أي دفع في هذا الفرع خلال الأسبوع.' });
    }
  });
  if (pendingPayments.count > 10) {
    alerts.push({ severity: 'info', title: 'طلبات دفع غير مكتملة', detail: `${pendingPayments.count} طلب دفع لم يكتمل — فرص متابعة.` });
  }

  const weekKey = weekAgo.toISOString().slice(0, 10);
  const report = {
    id: weekKey,
    generatedAt: iso(now),
    weekStart: iso(weekAgo),
    weekEnd: iso(now),
    totals: {
      revenue,
      paymentsReceived,
      newStudents,
      newReservations,
      pendingPayments,
      pendingVerifications,
      stuckPayments,
    },
    branches: branchRows,
    popularCourses,
    alerts,
  };

  if (persist) {
    try {
      await db.collection('ownerReports').doc(weekKey).set({
        ...report,
        generatedAtTs: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[weeklyReport] persist failed:', e.message);
    }
  }

  return report;
}

module.exports = { generateWeeklyReport };
