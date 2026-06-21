/**
 * Owner analytics — Phase 2 (groups, retention, student lifecycle).
 *
 * Revenue is read from the immutable `/ledger` (single source of truth) via one
 * windowed paidAt query per request; everything else is grouped in memory. Owner
 * -only (requireOwner), cross-branch.
 *
 * Retention is SUPPORT-SUBSCRIPTION based (the recurring monthly service);
 * one-time language/training enrolments are excluded from cohort math.
 */

const { admin, db } = require('../config/firebase');
const H = require('../services/analyticsHelpers');
const { normalizeGroupType, classify } = require('../services/supportEligibility');

const INACTIVE_STATES = ['inactive', 'archived', 'deleted'];
const ACTIVE_DAYS = 35;     // paid within ~1 cycle → active
const AT_RISK_DAYS = 70;    // 1–2 cycles late → at risk; beyond → inactive

const branchFilter = (q) => (H.BRANCHES.includes(q) ? q : null);

// ── GET /api/owner/groups?month=&branchId= ─────────────────────────────────────
// Per-class: branch, teacher, active students, monthly fee, expected vs actual,
// difference, retention rate. Highlights discrepancies.

const getGroups = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const branches = branchId ? [branchId] : H.BRANCHES;
    const { key, start, end } = H.monthBounds(req.query.month);
    const prevStart = H.monthBounds(H.shiftMonth(key, -1)).start;

    // One window covering previous + current month powers actual revenue + retention.
    const windowByBranch = {};
    await Promise.all(branches.map(async (b) => {
      windowByBranch[b] = await H.loadLedgerWindow(prevStart, end, b);
    }));

    const rows = [];
    for (const b of branches) {
      const classesSnap = await db.collection('branches').doc(b).collection('classes').get();
      const entries = windowByBranch[b] || [];

      // Index ledger by classId → { thisMonth:Set, lastMonth:Set, actualThis:number }
      const byClass = {};
      for (const e of entries) {
        if (!e.classId) continue;
        const m = H.entryMonth(e);
        const slot = byClass[e.classId] || (byClass[e.classId] = { thisMonth: new Set(), lastMonth: new Set(), actualThis: 0 });
        if (m === key) { slot.actualThis += H.num(e.amount); if (e.studentId) slot.thisMonth.add(e.studentId); }
        else if (e.studentId) slot.lastMonth.add(e.studentId);
      }

      classesSnap.docs.forEach((d) => {
        const c = d.data() || {};
        if ((c.status || 'active') === 'inactive') return;
        const slot = byClass[d.id] || { thisMonth: new Set(), lastMonth: new Set(), actualThis: 0 };
        const monthlyFee = H.num(c.price ?? c.monthlyPrice);
        const activeStudents = H.num(c.enrollmentCount);
        const expected = activeStudents * monthlyFee;
        const actual = slot.actualThis;

        // Retention: of students who paid this class last month, how many paid again this month.
        let retained = 0;
        slot.lastMonth.forEach((s) => { if (slot.thisMonth.has(s)) retained += 1; });
        const retentionRate = slot.lastMonth.size > 0
          ? Math.round((retained / slot.lastMonth.size) * 1000) / 10
          : null;

        const difference = expected - actual;
        rows.push({
          classId: d.id,
          branchId: b,
          branchName: H.BRANCH_NAMES[b] || b,
          groupName: c.groupName || c.name || c.subjectName || '—',
          subjectName: c.subjectName || null,
          serviceType: c.serviceType || null,
          groupType: c.serviceType === 'support' ? normalizeGroupType(c.groupType) : null,
          teacherName: c.teacherName || '—',
          activeStudents,
          payingThisMonth: slot.thisMonth.size,
          monthlyFee,
          expectedRevenue: expected,
          actualRevenue: actual,
          difference,
          retentionRate,
          // Flag a meaningful shortfall (expected revenue not collected).
          discrepancy: expected > 0 && actual < expected * 0.9,
        });
      });
    }

    rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
    return res.json({ month: key, branchId: branchId || 'all', groups: rows });
  } catch (err) { next(err); }
};

// ── GET /api/owner/retention?month=&months=6&branchId= ─────────────────────────
// Monthly cohorts: students at start, joined, left, remaining + retention/growth.

const getRetention = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const n = Math.min(24, Math.max(2, Number(req.query.months) || 6));
    const endKey = H.monthBounds(req.query.month).key;
    // Need one extra leading month to compute the first row's "start" + retention.
    const months = H.lastNMonths(endKey, n);
    const seriesStart = H.monthBounds(H.shiftMonth(months[0], -1)).start;
    const seriesEnd = H.monthBounds(endKey).end;

    const entries = (await H.loadLedgerWindow(seriesStart, seriesEnd, branchId))
      .filter((e) => e.serviceType === 'support' && H.num(e.amount) > 0);

    // active months per student + global active set per month.
    const activeByMonth = {};            // month → Set(studentId)
    const firstMonth = {};               // studentId → earliest active month
    for (const e of entries) {
      const m = H.entryMonth(e); if (!m || !e.studentId) continue;
      (activeByMonth[m] || (activeByMonth[m] = new Set())).add(e.studentId);
      if (!firstMonth[e.studentId] || m < firstMonth[e.studentId]) firstMonth[e.studentId] = m;
    }
    const setFor = (m) => activeByMonth[m] || new Set();

    const series = months.map((m) => {
      const prev = H.shiftMonth(m, -1);
      const cur = setFor(m), pre = setFor(prev);
      let retained = 0; pre.forEach((s) => { if (cur.has(s)) retained += 1; });
      let joined = 0; cur.forEach((s) => { if (firstMonth[s] === m) joined += 1; });
      let returning = 0; cur.forEach((s) => { if (firstMonth[s] && firstMonth[s] < m) returning += 1; });
      let left = 0; pre.forEach((s) => { if (!cur.has(s)) left += 1; });
      const startCount = pre.size;
      return {
        month: m,
        studentsAtStart: startCount,
        joined, returning, left,
        remaining: cur.size,
        retentionRate: startCount > 0 ? Math.round((retained / startCount) * 1000) / 10 : null,
        growthRate: startCount > 0 ? Math.round(((cur.size - startCount) / startCount) * 1000) / 10 : null,
      };
    });

    const latest = series[series.length - 1] || {};
    return res.json({
      branchId: branchId || 'all',
      months: n,
      series,
      latest: { new: latest.joined || 0, returning: latest.returning || 0, lost: latest.left || 0, active: latest.remaining || 0 },
    });
  } catch (err) { next(err); }
};

// ── GET /api/owner/students?branchId=&status=&report= ──────────────────────────
// Lifecycle list: join date, branch, status, last payment, group/payment history.
// report ∈ { missing_payment | inactive | left } narrows the list.

const getStudents = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const branches = branchId ? [branchId] : H.BRANCHES;
    const statusFilter = req.query.status || null;
    const report = req.query.report || null;

    const now = new Date();
    const curKey = H.monthKeyOf(now);
    const prevKey = H.shiftMonth(curKey, -1);
    // 12-month window for payment history / last payment.
    const windowStart = H.monthBounds(H.shiftMonth(curKey, -11)).start;

    const out = [];
    const summary = { active: 0, at_risk: 0, inactive: 0, total: 0 };

    for (const b of branches) {
      const [usersSnap, entries] = await Promise.all([
        db.collection('branches').doc(b).collection('users').get(),
        H.loadLedgerWindow(windowStart, new Date(now.getTime() + 86400000), b),
      ]);

      // Per-student ledger aggregation.
      const agg = {}; // uid → { last:Date, count, total, groups:Set, months:Set }
      for (const e of entries) {
        if (!e.studentId) continue;
        const a = agg[e.studentId] || (agg[e.studentId] = { last: null, count: 0, total: 0, groups: new Set(), months: new Set() });
        a.count += 1; a.total += H.num(e.amount);
        const d = e.paidAt && e.paidAt.toDate ? e.paidAt.toDate() : null;
        if (d && (!a.last || d > a.last)) a.last = d;
        if (e.className || e.classId) a.groups.add(e.className || e.classId);
        const m = H.entryMonth(e); if (m) a.months.add(m);
      }

      usersSnap.docs.forEach((d) => {
        const u = d.data() || {};
        if ((u.role && u.role !== 'student')) return;
        const a = agg[d.id] || { last: null, count: 0, total: 0, groups: new Set(), months: new Set() };
        const lifecycle = String(u.lifecycleStatus || '').toLowerCase();

        const daysSince = a.last ? Math.floor((now - a.last) / 86400000) : null;
        let status;
        if (INACTIVE_STATES.includes(lifecycle)) status = 'inactive';
        else if (daysSince == null) status = 'inactive';            // never paid
        else if (daysSince <= ACTIVE_DAYS) status = 'active';
        else if (daysSince <= AT_RISK_DAYS) status = 'at_risk';     // stopped paying recently
        else status = 'inactive';

        const paidThisMonth = a.months.has(curKey);
        const paidLastMonth = a.months.has(prevKey);
        const stoppedPaying = !paidThisMonth && (status === 'at_risk' || (paidLastMonth && status !== 'active'));

        const row = {
          userId: d.id,
          branchId: b,
          name: u.name || u.fullName || u.email || '—',
          email: u.email || null,
          joinDate: u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toISOString() : null,
          status,
          lastPaymentDate: a.last ? a.last.toISOString() : null,
          daysSinceLastPayment: daysSince,
          paymentCount: a.count,
          totalPaid: a.total,
          groupHistory: Array.from(a.groups),
          paidThisMonth,
          stoppedPaying,
        };

        summary.total += 1;
        summary[status] = (summary[status] || 0) + 1;

        // Report filters.
        if (report === 'missing_payment' && (status === 'inactive' || paidThisMonth)) return;
        if (report === 'inactive' && status !== 'inactive') return;
        if (report === 'left' && !(paidLastMonth && !paidThisMonth)) return;
        if (statusFilter && status !== statusFilter) return;

        out.push(row);
      });
    }

    out.sort((a, b) => (b.daysSinceLastPayment ?? 99999) - (a.daysSinceLastPayment ?? 99999));
    return res.json({ branchId: branchId || 'all', report: report || 'all', summary, students: out });
  } catch (err) { next(err); }
};

// ── GET /api/owner/teachers?month=&branchId= ───────────────────────────────────
// Per-teacher: #groups, #students, revenue generated, retention rate, growth.
// Best performers and teachers losing students surface from sorting/flags.

const getTeachers = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const branches = branchId ? [branchId] : H.BRANCHES;
    const { key, start, end } = H.monthBounds(req.query.month);
    const prevStart = H.monthBounds(H.shiftMonth(key, -1)).start;

    // teacherName → aggregate (teacher identity is the name snapshot on classes/ledger).
    const teachers = {};
    const get = (name) => (teachers[name] || (teachers[name] = {
      teacherName: name, branches: new Set(), groups: 0, enrolledStudents: 0,
      revenue: 0, payingThis: new Set(), payingLast: new Set(), subjects: new Set(),
    }));

    // Classes → group count + enrolled students + subjects.
    for (const b of branches) {
      const snap = await db.collection('branches').doc(b).collection('classes').get();
      snap.docs.forEach((d) => {
        const c = d.data() || {};
        if ((c.status || 'active') === 'inactive') return;
        const name = (c.teacherName || '').trim();
        if (!name) return;
        const t = get(name);
        t.branches.add(b); t.groups += 1; t.enrolledStudents += H.num(c.enrollmentCount);
        if (c.subjectName) t.subjects.add(c.subjectName);
      });
    }

    // Ledger (prev + this month) → revenue this month + paying-student sets for retention/growth.
    for (const b of branches) {
      const entries = await H.loadLedgerWindow(prevStart, end, b);
      for (const e of entries) {
        const name = (e.teacherName || '').trim();
        if (!name) continue;
        const t = get(name);
        const m = H.entryMonth(e);
        if (m === key) { t.revenue += H.num(e.amount); if (e.studentId) t.payingThis.add(e.studentId); }
        else if (e.studentId) t.payingLast.add(e.studentId);
      }
    }

    const rows = Object.values(teachers).map((t) => {
      let retained = 0; t.payingLast.forEach((s) => { if (t.payingThis.has(s)) retained += 1; });
      const retentionRate = t.payingLast.size > 0 ? Math.round((retained / t.payingLast.size) * 1000) / 10 : null;
      const growthRate = t.payingLast.size > 0
        ? Math.round(((t.payingThis.size - t.payingLast.size) / t.payingLast.size) * 1000) / 10
        : null;
      return {
        teacherName: t.teacherName,
        branches: Array.from(t.branches).map((b) => H.BRANCH_NAMES[b] || b),
        subjects: Array.from(t.subjects),
        groups: t.groups,
        students: t.enrolledStudents,
        payingStudents: t.payingThis.size,
        revenue: t.revenue,
        retentionRate,
        growthRate,
        losingStudents: growthRate != null && growthRate < 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    return res.json({ month: key, branchId: branchId || 'all', teachers: rows });
  } catch (err) { next(err); }
};

// ── GET /api/owner/support-overview?branchId= ──────────────────────────────────
// Per-branch support-level (دروس الدعم) snapshot: how many weak students exist,
// where they're assigned, low-level group count + occupancy. Lets the owner see
// instantly which branches need more support groups.

const getSupportOverview = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const branches = branchId ? [branchId] : H.BRANCHES;
    const now = new Date();
    const rows = [];

    for (const b of branches) {
      const [usersSnap, classesSnap, regsSnap] = await Promise.all([
        db.collection('branches').doc(b).collection('users').get(),
        db.collection('branches').doc(b).collection('classes').get(),
        db.collection('supportLessonRegistrations').where('branchId', '==', b).get(),
      ]);

      // Support-level student ids (classification recomputed from the average).
      const supportIds = new Set();
      usersSnap.docs.forEach((d) => {
        const u = d.data() || {};
        if (u.role && u.role !== 'student') return;
        const c = u.distinguishedSubjectsAverage != null
          ? classify(u.distinguishedSubjectsAverage)
          : (u.supportClassification || null);
        if (c === 'support_level') supportIds.add(d.id);
      });

      let supportGroups = 0; let lowLevelGroups = 0; let occSum = 0; let occN = 0;
      classesSnap.docs.forEach((d) => {
        const c = d.data() || {};
        if (c.serviceType !== 'support') return;
        if ((c.status || 'active') === 'inactive') return;
        supportGroups += 1;
        if (normalizeGroupType(c.groupType) === 'low_level_support') lowLevelGroups += 1;
        const cap = H.num(c.capacity);
        if (cap > 0) { occSum += Math.min(1, H.num(c.enrollmentCount) / cap); occN += 1; }
      });

      const assignedSet = new Set();
      regsSnap.docs.forEach((d) => {
        const r = d.data() || {};
        if (String(r.status || '').toLowerCase() !== 'verified') return;
        const end = r.endDate && r.endDate.toDate ? r.endDate.toDate() : (r.endDate ? new Date(r.endDate) : null);
        if (end && end <= now) return;
        if (normalizeGroupType(r.groupType) !== 'low_level_support') return;
        if (r.userId) assignedSet.add(r.userId);
      });
      let assigned = 0;
      assignedSet.forEach((uid) => { if (supportIds.has(uid)) assigned += 1; });

      rows.push({
        branchId: b,
        branchName: H.BRANCH_NAMES[b] || b,
        supportStudents: supportIds.size,
        assigned,
        waiting: Math.max(0, supportIds.size - assigned),
        supportGroups,
        lowLevelGroups,
        occupancyRate: occN > 0 ? Math.round((occSum / occN) * 100) : 0,
      });
    }

    const totals = rows.reduce((t, r) => ({
      supportStudents: t.supportStudents + r.supportStudents,
      assigned: t.assigned + r.assigned,
      waiting: t.waiting + r.waiting,
      lowLevelGroups: t.lowLevelGroups + r.lowLevelGroups,
    }), { supportStudents: 0, assigned: 0, waiting: 0, lowLevelGroups: 0 });

    return res.json({ branchId: branchId || 'all', branches: rows, totals });
  } catch (err) { next(err); }
};

module.exports = { getGroups, getRetention, getStudents, getTeachers, getSupportOverview };
