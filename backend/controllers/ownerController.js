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
const academicYearSvc = require('../services/academicYear');
const { loadExpectedSupportRevenue } = require('../services/expectedRevenueService');

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

/**
 * Resolve the reporting window from the request query. Owner statistics default
 * to the CURRENT academic year (spec: no manual year; auto-detected from date);
 * an explicit `academicYear` ("YYYY-YYYY") views history, and `month` ("YYYY-MM")
 * is the monthly drill-down. loadLedger uses a half-open [start, end) range, so
 * the academic-year end (30 Jun 23:59:59.999) is bumped +1ms to stay inclusive.
 * A selected year/month only changes what is DISPLAYED — never the active year.
 */
function resolveOwnerWindow(query = {}) {
  const ay = query.academicYear;
  if (ay && /^\d{4}-\d{4}$/.test(ay)) {
    const b = academicYearSvc.academicYearBounds(ay);
    if (b) return { mode: 'year', label: b.label, startYear: b.startYear, start: b.start, end: new Date(b.end.getTime() + 1) };
  }
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const m = monthBounds(query.month);
    return { mode: 'month', label: m.key, key: m.key, start: m.start, end: m.end };
  }
  const cur = academicYearSvc.getCurrentAcademicYear();
  return { mode: 'year', label: cur.label, startYear: cur.startYear, start: cur.start, end: new Date(cur.end.getTime() + 1) };
}

/** Previous comparable window (prior academic year, or prior month). */
function prevWindow(win) {
  if (win.mode === 'year') {
    const b = academicYearSvc.academicYearBounds(win.startYear - 1);
    return { label: b.label, start: b.start, end: new Date(b.end.getTime() + 1) };
  }
  const p = monthBounds(prevMonthKey(win.key));
  return { label: p.key, start: p.start, end: p.end };
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

// Expected support revenue is NO LONGER `enrollmentCount × price`. Support is
// billed on a prorated calendar-month cycle, so the target must be the sum of
// each active subscription's stored payable amount. That figure is owned by
// services/expectedRevenueService (loadExpectedSupportRevenue) — the single
// source of truth shared with group analytics and the collection-shortfall
// alerts — so every surface reports the same expected number.

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
    const win = resolveOwnerWindow(req.query);
    const { start, end } = win;
    const prev = prevWindow(win);

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

    // Student metrics + classes + expected support revenue per branch. Expected
    // is a LIVE snapshot of currently-active subscriptions (same as before), but
    // now summed from each student's stored payable amount instead of a flat
    // enrollment × price — so a prorated late joiner counts for exactly what they
    // owe. It intentionally does not vary with the selected window; the forecast
    // below already gates its use to the current month.
    const perBranch = await Promise.all(BRANCHES.map(async (b) => {
      const [students, classes, expectedSupport] = await Promise.all([
        studentMetrics(b, start, end),
        loadClasses(b),
        loadExpectedSupportRevenue(b),
      ]);
      return { branchId: b, students, classes, expectedSupport: expectedSupport.total };
    }));

    const activeStudents = perBranch.reduce((a, x) => a + x.students.active, 0);
    const newStudents    = perBranch.reduce((a, x) => a + x.students.newThisMonth, 0);
    const unpaidStudents = perBranch.reduce((a, x) => a + x.students.unpaid, 0);
    const totalGroups    = perBranch.reduce((a, x) => a + x.classes.length, 0);

    const expectedRevenue = perBranch.reduce((a, x) => a + x.expectedSupport, 0);
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
    // The forecast is a MONTH concept: a linear run-rate of support revenue
    // collected so far this month, scaled to the full month, against the expected
    // recurring target. It is meaningful ONLY when viewing a single month; in
    // academic-year mode (the default) it is not applicable and we report the
    // year's collected support revenue only.
    let forecast;
    if (win.mode === 'month') {
      const key = win.key;
      const [fy, fm] = key.split('-').map(Number);
      const daysInMonth = new Date(fy, fm, 0).getDate();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const isCurrentMonth = key === currentMonthKey;
      const isPastMonth = key < currentMonthKey;
      const isFutureMonth = !isCurrentMonth && !isPastMonth;
      const daysElapsed = isCurrentMonth ? now.getDate() : (isPastMonth ? daysInMonth : 0);
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
      forecast = {
        basis: 'support', applicable: forecastApplicable,
        current: actualSupport, projected: forecastProjected, target: forecastTarget,
        collectionPct, status: forecastStatus,
        isCurrentMonth, isPastMonth, isFutureMonth, daysElapsed, daysInMonth,
      };
    } else {
      forecast = {
        basis: 'support', applicable: false,
        current: actualSupport, projected: null, target: null,
        collectionPct: null, status: null,
        isCurrentMonth: false, isPastMonth: false, isFutureMonth: false,
        daysElapsed: 0, daysInMonth: 0,
      };
    }

    return res.json({
      month: win.mode === 'month' ? win.key : null,
      mode: win.mode,                                   // 'year' | 'month'
      academicYear: win.mode === 'year' ? win.label : null,
      windowLabel: win.label,
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
      forecast,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/owner/branches?month=YYYY-MM ──────────────────────────────────────

const getBranches = async (req, res, next) => {
  try {
    const { start, end } = resolveOwnerWindow(req.query);
    const branchDocs = {};
    (await db.collection('branches').get()).docs.forEach((d) => { branchDocs[d.id] = d.data(); });

    const rows = await Promise.all(BRANCHES.map(async (b) => {
      const [ledger, students, classes, expectedSupport] = await Promise.all([
        loadLedger(start, end, b),
        studentMetrics(b, start, end),
        loadClasses(b),
        loadExpectedSupportRevenue(b),
      ]);
      const expected = expectedSupport.total;
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
    const win = resolveOwnerWindow(req.query);
    const { start, end } = win;
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

    return res.json({
      month: win.mode === 'month' ? win.key : null,
      mode: win.mode,
      academicYear: win.mode === 'year' ? win.label : null,
      windowLabel: win.label,
      branchId: branchId || 'all',
      services: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSummary, getBranches, getRevenue };
