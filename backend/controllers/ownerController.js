/**
 * Owner analytics — cross-branch business intelligence. All numbers are derived
 * dynamically from Firestore; the `/ledger` collection is the source of truth for
 * revenue (actual), and live `classes`/`users` docs drive expected revenue and
 * student metrics. Owner-only (requireOwner); never branch-bound.
 *
 * Efficiency: each request fetches the month's ledger ONCE and groups it in
 * memory (one query powers summary, branches and revenue), and uses count()
 * aggregates for student metrics rather than reading every user doc.
 */

const { admin, db } = require('../config/firebase');

const Timestamp = admin.firestore.Timestamp;
const BRANCHES = ['boumerdes', 'bordj_menaiel'];
const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };
const SERVICE_LABELS = { language: 'اللغات', support: 'دروس الدعم', training: 'الدورات التكوينية', annualFee: 'الرسوم السنوية' };
const INACTIVE_STATES = ['inactive', 'archived', 'deleted'];

// ── time helpers ───────────────────────────────────────────────────────────────

function monthBounds(month) {
  let y, m;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const parts = month.split('-').map(Number);
    y = parts[0]; m = parts[1];
  } else {
    const d = new Date();
    y = d.getFullYear(); m = d.getMonth() + 1;
  }
  return {
    key:   `${y}-${String(m).padStart(2, '0')}`,
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end:   new Date(y, m, 1, 0, 0, 0, 0),
  };
}

function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ── data loaders ───────────────────────────────────────────────────────────────

/** Fetch every ledger entry whose paidAt falls in [start, end). One query. */
async function loadLedger(start, end, branchId = null) {
  let q = db.collection('ledger')
    .where('paidAt', '>=', Timestamp.fromDate(start))
    .where('paidAt', '<',  Timestamp.fromDate(end));
  if (branchId) q = q.where('branchId', '==', branchId);
  const snap = await q.get();
  return snap.docs.map((d) => d.data());
}

/** Sum signed amounts (payments +, reversals -) → net revenue. */
function sumAmount(entries) {
  return entries.reduce((acc, e) => acc + num(e.amount), 0);
}

/** Load active classes for a branch (groups + expected-revenue inputs). */
async function loadClasses(branchId) {
  const snap = await db.collection('branches').doc(branchId).collection('classes').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => (c.status || 'active') !== 'inactive');
}

/** Expected monthly support revenue = Σ active support classes (enrollment × price). */
function expectedSupportRevenue(classes) {
  return classes
    .filter((c) => c.serviceType === 'support')
    .reduce((acc, c) => acc + num(c.enrollmentCount) * num(c.price ?? c.monthlyPrice), 0);
}

/** Student metrics for one branch via count() aggregates (cheap, no doc reads). */
async function studentMetrics(branchId, start, end) {
  const usersRef = db.collection('branches').doc(branchId).collection('users');
  const safeCount = async (q) => {
    try { return (await q.count().get()).data().count || 0; } catch { return 0; }
  };

  const [total, inactive, paid, newThisMonth] = await Promise.all([
    safeCount(usersRef),
    safeCount(usersRef.where('lifecycleStatus', 'in', INACTIVE_STATES)),
    safeCount(usersRef.where('yearlyFeePaid', '==', true)),
    safeCount(usersRef
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<',  Timestamp.fromDate(end))),
  ]);

  const active = Math.max(0, total - inactive);
  const unpaid = Math.max(0, active - paid);
  return { total, active, inactive, lost: inactive, paid, unpaid, newThisMonth };
}

// ── GET /api/owner/summary?month=YYYY-MM ───────────────────────────────────────

const getSummary = async (req, res, next) => {
  try {
    const { key, start, end } = monthBounds(req.query.month);
    const prevKey = prevMonthKey(key);
    const prev = monthBounds(prevKey);

    // Today's window (only meaningful for the current month, but always correct).
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

    const [monthLedger, prevLedger, todayLedger, branchesSnap] = await Promise.all([
      loadLedger(start, end),
      loadLedger(prev.start, prev.end),
      loadLedger(todayStart, todayEnd),
      db.collection('branches').get(),
    ]);

    // Student metrics + classes per branch.
    const perBranch = await Promise.all(BRANCHES.map(async (b) => ({
      branchId: b,
      students: await studentMetrics(b, start, end),
      classes:  await loadClasses(b),
    })));

    const activeStudents = perBranch.reduce((a, x) => a + x.students.active, 0);
    const newStudents    = perBranch.reduce((a, x) => a + x.students.newThisMonth, 0);
    const unpaidStudents = perBranch.reduce((a, x) => a + x.students.unpaid, 0);
    const totalGroups    = perBranch.reduce((a, x) => a + x.classes.length, 0);

    const expectedRevenue = perBranch.reduce((a, x) => a + expectedSupportRevenue(x.classes), 0);
    const actualSupport   = sumAmount(monthLedger.filter((e) => e.serviceType === 'support'));
    const totalRevenue    = sumAmount(monthLedger);
    const prevRevenue     = sumAmount(prevLedger);
    const revenueToday    = sumAmount(todayLedger);

    // New students last month (trend).
    const prevNew = (await Promise.all(BRANCHES.map(async (b) => {
      const usersRef = db.collection('branches').doc(b).collection('users');
      try {
        return (await usersRef
          .where('createdAt', '>=', Timestamp.fromDate(prev.start))
          .where('createdAt', '<',  Timestamp.fromDate(prev.end)).count().get()).data().count || 0;
      } catch { return 0; }
    }))).reduce((a, x) => a + x, 0);

    const pct = (cur, base) => (base > 0 ? Math.round(((cur - base) / base) * 1000) / 10 : null);

    // ── Financial forecast (support-subscription basis) ──────────────────────────
    // Anticipates where the month will land instead of only reporting the past.
    // Non-arbitrary: a linear run-rate of what has actually been collected so far
    // this month, scaled to the full month. Target = expected recurring support
    // revenue (Σ active support enrollment × price) — the money we *should* collect.
    // Completed (past) months are already final, so the projection equals the actual;
    // future months carry no projection. Same basis as the expected/actual cards, so
    // "collection %" is honest and can't exceed ~100% by mixing service types.
    const [fy, fm] = key.split('-').map(Number);
    const daysInMonth = new Date(fy, fm, 0).getDate();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = key === currentMonthKey;
    const isPastMonth = key < currentMonthKey;
    const isFutureMonth = !isCurrentMonth && !isPastMonth;
    const daysElapsed = isCurrentMonth ? now.getDate() : (isPastMonth ? daysInMonth : 0);

    // The target-relative verdict is meaningful ONLY for the current month: the
    // target (expectedRevenue) is a snapshot of *today's* active enrollment, not
    // the selected month's, so applying it to a completed/future month would mix
    // a live target with a historical actual. For past months we therefore report
    // the final collected figure only (no target/collection%/status); future
    // months carry nothing yet.
    const forecastApplicable = isCurrentMonth;
    const forecastProjected = isCurrentMonth
      ? (daysElapsed > 0 ? Math.round((actualSupport / daysElapsed) * daysInMonth) : 0)
      : (isPastMonth ? actualSupport : null);
    const forecastTarget = forecastApplicable ? expectedRevenue : null;
    const collectionPct = forecastApplicable && expectedRevenue > 0
      ? Math.round((actualSupport / expectedRevenue) * 100)
      : null;
    let forecastStatus = null;
    if (forecastApplicable && expectedRevenue > 0) {
      const ratio = forecastProjected / expectedRevenue;
      forecastStatus = ratio >= 1.05 ? 'ahead' : ratio < 0.9 ? 'behind' : 'on_track';
    }

    return res.json({
      month: key,
      cards: {
        totalRevenueThisMonth: totalRevenue,
        revenueToday,
        activeStudents,
        newStudentsThisMonth: newStudents,
        unpaidStudents,
        expectedRevenue,
        actualRevenue: actualSupport,
        revenueDifference: expectedRevenue - actualSupport,
        totalBranches: branchesSnap.size || BRANCHES.length,
        totalGroups,
      },
      trends: {
        revenue:     { current: totalRevenue, previous: prevRevenue, changePct: pct(totalRevenue, prevRevenue) },
        newStudents: { current: newStudents, previous: prevNew, changePct: pct(newStudents, prevNew) },
      },
      forecast: {
        basis: 'support',            // client labels this clearly (اشتراكات الدعم)
        applicable: forecastApplicable, // target-relative verdict valid only for the current month
        current: actualSupport,      // collected so far this month (support)
        projected: forecastProjected,// run-rate projection to month end (final for past months)
        target: forecastTarget,      // expected recurring support revenue (null off current month)
        collectionPct,               // current / target (%) — null off current month
        status: forecastStatus,      // 'ahead' | 'on_track' | 'behind' | null
        isCurrentMonth,
        isPastMonth,
        isFutureMonth,
        daysElapsed,
        daysInMonth,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/owner/branches?month=YYYY-MM ──────────────────────────────────────

const getBranches = async (req, res, next) => {
  try {
    const { start, end } = monthBounds(req.query.month);
    const branchDocs = {};
    (await db.collection('branches').get()).docs.forEach((d) => { branchDocs[d.id] = d.data(); });

    const rows = await Promise.all(BRANCHES.map(async (b) => {
      const [ledger, students, classes] = await Promise.all([
        loadLedger(start, end, b),
        studentMetrics(b, start, end),
        loadClasses(b),
      ]);
      const expected = expectedSupportRevenue(classes);
      const actualSupport = sumAmount(ledger.filter((e) => e.serviceType === 'support'));
      const base = Math.max(1, students.active - students.newThisMonth);
      return {
        branchId: b,
        name: branchDocs[b]?.name || BRANCH_NAMES[b] || b,
        revenue: sumAmount(ledger),
        activeStudents: students.active,
        newStudents: students.newThisMonth,
        lostStudents: students.lost,
        groups: classes.length,
        expectedRevenue: expected,
        actualRevenue: actualSupport,
        growthRate: Math.round((students.newThisMonth / base) * 1000) / 10,
      };
    }));

    return res.json({ branches: rows });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/owner/revenue?month=YYYY-MM&branchId=&breakdown=service|subject ────

const getRevenue = async (req, res, next) => {
  try {
    const { key, start, end } = monthBounds(req.query.month);
    const branchId = BRANCHES.includes(req.query.branchId) ? req.query.branchId : null;
    const ledger = await loadLedger(start, end, branchId);

    // Group by serviceType → subject. Track revenue, distinct students, distinct groups.
    const services = {};
    for (const e of ledger) {
      const st = e.serviceType || 'other';
      if (!services[st]) services[st] = { serviceType: st, label: SERVICE_LABELS[st] || st, revenue: 0, students: new Set(), groups: new Set(), subjects: {} };
      const s = services[st];
      s.revenue += num(e.amount);
      if (e.studentId) s.students.add(e.studentId);
      if (e.classId) s.groups.add(e.classId);

      const subjKey = e.subjectId || e.subjectName || '—';
      if (!s.subjects[subjKey]) s.subjects[subjKey] = { subjectId: e.subjectId || null, subjectName: e.subjectName || 'غير محدد', revenue: 0, students: new Set(), groups: new Set() };
      const sub = s.subjects[subjKey];
      sub.revenue += num(e.amount);
      if (e.studentId) sub.students.add(e.studentId);
      if (e.classId) sub.groups.add(e.classId);
    }

    const result = Object.values(services).map((s) => ({
      serviceType: s.serviceType,
      label: s.label,
      revenue: s.revenue,
      studentCount: s.students.size,
      groupCount: s.groups.size,
      subjects: Object.values(s.subjects)
        .map((sub) => ({
          subjectId: sub.subjectId,
          subjectName: sub.subjectName,
          revenue: sub.revenue,
          studentCount: sub.students.size,
          groupCount: sub.groups.size,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    })).sort((a, b) => b.revenue - a.revenue);

    return res.json({ month: key, branchId: branchId || 'all', services: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSummary, getBranches, getRevenue };
