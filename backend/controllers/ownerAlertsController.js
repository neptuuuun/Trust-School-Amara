/**
 * Owner alerts engine (Phase 4, §12). Owner-only (requireOwner), cross-branch.
 *
 * Derives actionable alerts from the immutable `/ledger` (this month vs last),
 * live `branches/{b}/classes`, and the immutable `/auditLogs`. Everything is
 * computed in memory from a single windowed ledger fetch (prev + current month)
 * plus one classes read per branch and one audit window — NO new indexes:
 * reuses (branchId, paidAt) on /ledger and (branchId, at) on /auditLogs.
 *
 * Tunable thresholds live as top-level constants so the owner's "what counts as
 * a problem" can be adjusted in one place.
 */

const { admin, db } = require('../config/firebase');
const H = require('../services/analyticsHelpers');

const Timestamp = admin.firestore.Timestamp;

// ── Thresholds ─────────────────────────────────────────────────────────────────
const REVENUE_DROP_PCT       = 15;   // MoM revenue drop (%) that warrants an alert
const REVENUE_DROP_CRITICAL  = 30;   // …above this drop the alert is critical
const EXPECTED_ACTUAL_RATIO  = 0.9;  // actual < 0.9 × expected → collection shortfall
const SHORTFALL_CRITICAL     = 0.5;  // actual ≤ 0.5 × expected → critical shortfall
const GROUP_RETENTION_MIN    = 50;   // group retention below this (%) → losing students
const TEACHER_RETENTION_MIN  = 50;   // teacher retention below this (%) → alert
const RETENTION_CRITICAL     = 25;   // retention below this (%) → critical
const SENSITIVE_AUDIT_DAYS   = 30;   // window for payment.edit / payment.delete review
const CHURN_LEFT_MIN         = 3;    // ≥ this many support students lost → churn alert
const CHURN_CRITICAL_PCT     = 30;   // churn ≥ this % of last month's payers → critical
const MIN_PRIOR_STUDENTS     = 3;    // ignore tiny cohorts (retention noise)

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

const branchFilter = (q) => (H.BRANCHES.includes(q) ? q : null);
const fmtDZ = (n) => H.num(n).toLocaleString('en-US');

// ── GET /api/owner/alerts?month=&branchId= ─────────────────────────────────────
const getAlerts = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const branches = branchId ? [branchId] : H.BRANCHES;
    const { key, start, end } = H.monthBounds(req.query.month);
    const prevKey = H.shiftMonth(key, -1);
    const prevStart = H.monthBounds(prevKey).start;

    // One ledger window (prev + current month) per branch powers revenue MoM,
    // expected-vs-actual, and group/teacher/churn retention.
    const windowByBranch = {};
    await Promise.all(branches.map(async (b) => {
      windowByBranch[b] = await H.loadLedgerWindow(prevStart, end, b);
    }));

    const alerts = [];
    const push = (a) => alerts.push(a);

    // 1 ── Revenue drop (MoM): per-branch + overall ───────────────────────────────
    let totalThis = 0, totalPrev = 0;
    for (const b of branches) {
      let thisRev = 0, prevRev = 0;
      for (const e of windowByBranch[b] || []) {
        const m = H.entryMonth(e);
        if (m === key) thisRev += H.num(e.amount);
        else if (m === prevKey) prevRev += H.num(e.amount);
      }
      totalThis += thisRev; totalPrev += prevRev;
      if (prevRev > 0) {
        const dropPct = Math.round(((prevRev - thisRev) / prevRev) * 1000) / 10;
        if (dropPct >= REVENUE_DROP_PCT) {
          push({
            id: `revdrop-${b}-${key}`,
            severity: dropPct >= REVENUE_DROP_CRITICAL ? 'critical' : 'warning',
            type: 'revenue_drop',
            title: `انخفاض إيرادات ${H.BRANCH_NAMES[b] || b}`,
            message: `إيرادات فرع ${H.BRANCH_NAMES[b] || b} انخفضت ${dropPct}% مقارنة بالشهر السابق (${fmtDZ(prevRev)} ← ${fmtDZ(thisRev)} دج).`,
            branchId: b,
            value: dropPct,
            link: '/owner/revenue',
          });
        }
      }
    }
    if (!branchId && totalPrev > 0) {
      const dropPct = Math.round(((totalPrev - totalThis) / totalPrev) * 1000) / 10;
      if (dropPct >= REVENUE_DROP_PCT) {
        push({
          id: `revdrop-all-${key}`,
          severity: dropPct >= REVENUE_DROP_CRITICAL ? 'critical' : 'warning',
          type: 'revenue_drop',
          title: 'انخفاض الإيرادات الإجمالية',
          message: `إجمالي الإيرادات عبر كل الفروع انخفض ${dropPct}% مقارنة بالشهر السابق (${fmtDZ(totalPrev)} ← ${fmtDZ(totalThis)} دج).`,
          value: dropPct,
          link: '/owner/revenue',
        });
      }
    }

    // 2 ── Per-class: expected-vs-actual shortfall + group losing students ────────
    for (const b of branches) {
      const classesSnap = await db.collection('branches').doc(b).collection('classes').get();

      // Index ledger by classId → paying sets (this/last) + actual revenue this month.
      const byClass = {};
      for (const e of windowByBranch[b] || []) {
        if (!e.classId) continue;
        const m = H.entryMonth(e);
        const slot = byClass[e.classId] || (byClass[e.classId] = { thisMonth: new Set(), lastMonth: new Set(), actualThis: 0 });
        if (m === key) { slot.actualThis += H.num(e.amount); if (e.studentId) slot.thisMonth.add(e.studentId); }
        else if (m === prevKey && e.studentId) slot.lastMonth.add(e.studentId);
      }

      classesSnap.docs.forEach((d) => {
        const c = d.data() || {};
        if ((c.status || 'active') === 'inactive') return;
        const slot = byClass[d.id] || { thisMonth: new Set(), lastMonth: new Set(), actualThis: 0 };
        const monthlyFee = H.num(c.price ?? c.monthlyPrice);
        const expected = H.num(c.enrollmentCount) * monthlyFee;
        const actual = slot.actualThis;
        const groupName = c.groupName || c.name || c.subjectName || '—';

        // Expected vs actual mismatch.
        if (expected > 0 && actual < expected * EXPECTED_ACTUAL_RATIO) {
          const gap = expected - actual;
          push({
            id: `gap-${b}-${d.id}-${key}`,
            severity: actual <= expected * SHORTFALL_CRITICAL ? 'critical' : 'warning',
            type: 'revenue_shortfall',
            title: `عجز تحصيل: ${groupName}`,
            message: `مجموعة "${groupName}" (${H.BRANCH_NAMES[b] || b}) حصّلت ${fmtDZ(actual)} دج من أصل ${fmtDZ(expected)} دج متوقع — عجز ${fmtDZ(gap)} دج.`,
            branchId: b,
            value: gap,
            link: '/owner/groups',
          });
        }

        // Group losing students (retention < threshold, with a meaningful prior cohort).
        if (slot.lastMonth.size >= MIN_PRIOR_STUDENTS) {
          let retained = 0; slot.lastMonth.forEach((s) => { if (slot.thisMonth.has(s)) retained += 1; });
          const retentionRate = Math.round((retained / slot.lastMonth.size) * 1000) / 10;
          if (retentionRate < GROUP_RETENTION_MIN) {
            const lost = slot.lastMonth.size - retained;
            push({
              id: `grouploss-${b}-${d.id}-${key}`,
              severity: retentionRate < RETENTION_CRITICAL ? 'critical' : 'warning',
              type: 'group_retention',
              title: `تسرّب من مجموعة: ${groupName}`,
              message: `مجموعة "${groupName}" (${H.BRANCH_NAMES[b] || b}) احتفظت بـ ${retentionRate}% فقط — غادر ${lost} من ${slot.lastMonth.size} طالب.`,
              branchId: b,
              value: 100 - retentionRate,
              link: '/owner/groups',
            });
          }
        }
      });
    }

    // 3 ── Teacher retention below threshold ──────────────────────────────────────
    const teacherAgg = {};
    for (const b of branches) {
      for (const e of windowByBranch[b] || []) {
        const name = (e.teacherName || '').trim();
        if (!name || !e.studentId) continue;
        const t = teacherAgg[name] || (teacherAgg[name] = { payingThis: new Set(), payingLast: new Set(), branches: new Set() });
        t.branches.add(b);
        const m = H.entryMonth(e);
        if (m === key) t.payingThis.add(e.studentId);
        else if (m === prevKey) t.payingLast.add(e.studentId);
      }
    }
    Object.entries(teacherAgg).forEach(([name, t]) => {
      if (t.payingLast.size < MIN_PRIOR_STUDENTS) return;
      let retained = 0; t.payingLast.forEach((s) => { if (t.payingThis.has(s)) retained += 1; });
      const retentionRate = Math.round((retained / t.payingLast.size) * 1000) / 10;
      if (retentionRate < TEACHER_RETENTION_MIN) {
        push({
          id: `teacher-${name}-${key}`,
          severity: retentionRate < RETENTION_CRITICAL ? 'critical' : 'warning',
          type: 'teacher_retention',
          title: `احتفاظ منخفض: الأستاذ ${name}`,
          message: `الأستاذ ${name} احتفظ بـ ${retentionRate}% فقط من طلابه الدافعين الشهر السابق (${t.payingLast.size} طالب).`,
          branchId: t.branches.size === 1 ? Array.from(t.branches)[0] : undefined,
          value: 100 - retentionRate,
          link: '/owner/teachers',
        });
      }
    });

    // 4 ── Sensitive audit actions: payment.edit + payment.delete in last 30d ─────
    const auditSince = new Date(Date.now() - SENSITIVE_AUDIT_DAYS * 86400000);
    let auditQ = db.collection('auditLogs').where('at', '>=', Timestamp.fromDate(auditSince));
    if (branchId) auditQ = auditQ.where('branchId', '==', branchId);
    const auditSnap = await auditQ.get();
    let edits = 0, deletes = 0;
    auditSnap.docs.forEach((d) => {
      const a = (d.data() || {}).action;
      if (a === 'payment.edit') edits += 1;
      else if (a === 'payment.delete') deletes += 1;
    });
    if (deletes > 0) {
      push({
        id: `audit-delete-${key}`,
        severity: 'critical',
        type: 'sensitive_audit',
        title: 'عمليات حذف مدفوعات',
        message: `${deletes} عملية حذف دفعة خلال آخر ${SENSITIVE_AUDIT_DAYS} يوم — راجع سجل التدقيق.`,
        value: deletes,
        link: '/owner/audit',
      });
    }
    if (edits > 0) {
      push({
        id: `audit-edit-${key}`,
        severity: 'warning',
        type: 'sensitive_audit',
        title: 'تعديلات على المدفوعات',
        message: `${edits} عملية تعديل دفعة خلال آخر ${SENSITIVE_AUDIT_DAYS} يوم — راجع سجل التدقيق.`,
        value: edits,
        link: '/owner/audit',
      });
    }

    // 5 ── Rising/high churn: support students who stopped paying this month ──────
    const supportPrev = new Set(), supportThis = new Set();
    for (const b of branches) {
      for (const e of windowByBranch[b] || []) {
        if (e.serviceType !== 'support' || !e.studentId || H.num(e.amount) <= 0) continue;
        const m = H.entryMonth(e);
        if (m === key) supportThis.add(e.studentId);
        else if (m === prevKey) supportPrev.add(e.studentId);
      }
    }
    let left = 0; supportPrev.forEach((s) => { if (!supportThis.has(s)) left += 1; });
    if (left >= CHURN_LEFT_MIN) {
      const churnPct = supportPrev.size > 0 ? Math.round((left / supportPrev.size) * 1000) / 10 : null;
      push({
        id: `churn-${key}`,
        severity: churnPct != null && churnPct >= CHURN_CRITICAL_PCT ? 'critical' : 'warning',
        type: 'churn',
        title: 'ارتفاع تسرّب الطلاب',
        message: `${left} طالب دعم توقفوا عن الدفع هذا الشهر${churnPct != null ? ` (${churnPct}% من طلاب الشهر السابق)` : ''}.`,
        value: left,
        link: '/owner/retention',
      });
    }

    // Sort: severity (critical → info), then magnitude.
    alerts.sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      return s !== 0 ? s : (H.num(b.value) - H.num(a.value));
    });

    const counts = { critical: 0, warning: 0, info: 0 };
    alerts.forEach((a) => { counts[a.severity] = (counts[a.severity] || 0) + 1; });

    return res.json({
      generatedAt: new Date().toISOString(),
      month: key,
      branchId: branchId || 'all',
      counts: { ...counts, total: alerts.length },
      alerts,
    });
  } catch (err) { next(err); }
};

module.exports = { getAlerts };
