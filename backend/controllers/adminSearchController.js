/**
 * adminSearchController.js
 * ------------------------
 * Global admin search — one endpoint that answers "find me this student / payment
 * / registration" across the caller's branch.
 *
 * Two collections cover every requested dimension:
 *   • branches/{b}/users   → students by name / email / phone / school
 *   • paymentOrders        → EVERY payment (language / training / support /
 *                            annual fee) carries serviceType, serviceName, amount
 *                            and studentId, so one scan covers registrations,
 *                            payments, annual fees and all course types.
 *
 * Branch isolation: requireAdmin pins req.adminBranchId, so both reads are scoped
 * to the caller's own branch. Matching is done in memory (Firestore has no
 * substring search) with a light Arabic normaliser so "احمد" matches "أحمد".
 * The users list is briefly cached because search is bursty (one read per typing
 * session instead of one per keystroke), and paymentOrders is capped to the
 * recent window to bound reads.
 */

const { db } = require('../config/firebase');

const USERS_TTL_MS = 20 * 1000;
const ORDERS_SCAN_LIMIT = 500;
const MAX_RESULTS = 20;

// branchId → { at, rows }
const usersCache = new Map();

/** Lowercase + strip Arabic diacritics/tatweel + unify alef/ya/ta-marbuta forms. */
function normalizeArabic(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '') // harakat
    .replace(/ـ/g, '')                // tatweel
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadBranchUsers(branchId) {
  const cached = usersCache.get(branchId);
  if (cached && Date.now() - cached.at < USERS_TTL_MS) return cached.rows;
  const snap = await db.collection('branches').doc(branchId).collection('users').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  usersCache.set(branchId, { at: Date.now(), rows });
  return rows;
}

const phoneOf = (u) => u.studentPhone || u.phone || u.phoneNumber || u.guardianPhone || '';
const nameOf = (u) => u.name || u.fullName || u.studentName || '';

/**
 * GET /api/admin/search?q=...
 * Returns { query, students: [...], payments: [...] } — each result carries what
 * the UI needs to render a row and navigate to the right place.
 */
const search = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId;
    if (!branchId) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }

    const q = normalizeArabic(req.query.q || '');
    if (q.length < 2) {
      return res.json({ query: q, students: [], payments: [] });
    }

    const [users, ordersSnap] = await Promise.all([
      loadBranchUsers(branchId),
      db.collection('paymentOrders')
        .where('branchId', '==', branchId)
        .orderBy('createdAt', 'desc')
        .limit(ORDERS_SCAN_LIMIT)
        .get(),
    ]);

    // email → uid, so a matched payment can deep-link to the student's 360 page
    // even on the (older) orders that predate the studentId field.
    const emailToUid = new Map();
    users.forEach((u) => {
      const e = normalizeArabic(u.email);
      if (e) emailToUid.set(e, u.id);
    });

    // ── Students ────────────────────────────────────────────────────────────
    const students = [];
    for (const u of users) {
      const hay = normalizeArabic(
        [nameOf(u), u.email, phoneOf(u), u.school].filter(Boolean).join(' ')
      );
      if (hay.includes(q)) {
        students.push({
          id: u.id,
          name: nameOf(u) || '—',
          email: u.email || '',
          phone: phoneOf(u),
          school: u.school || '',
          verificationStatus: u.verificationStatus || '',
        });
      }
      if (students.length >= MAX_RESULTS) break;
    }

    // ── Payments / registrations (all service types) ──────────────────────────
    const payments = [];
    for (const d of ordersSnap.docs) {
      const o = d.data() || {};
      const serviceName =
        o.serviceName || o.serviceData?.serviceName || o.serviceData?.subjectName ||
        o.serviceData?.trainingName || o.serviceData?.languageName || '';
      const hay = normalizeArabic(
        [o.studentName, o.studentEmail, o.serviceType, serviceName, String(o.amount ?? '')]
          .filter(Boolean)
          .join(' ')
      );
      if (!hay.includes(q)) continue;
      payments.push({
        orderId: d.id,
        userId: o.studentId || emailToUid.get(normalizeArabic(o.studentEmail)) || null,
        studentName: o.studentName || '',
        studentEmail: o.studentEmail || '',
        serviceType: o.serviceType || '',
        serviceName,
        amount: Number(o.amount) || 0,
        status: o.status || '',
        createdAt: o.createdAt || null,
      });
      if (payments.length >= MAX_RESULTS) break;
    }

    return res.json({ query: q, students, payments });
  } catch (err) {
    next(err);
  }
};

module.exports = { search };
