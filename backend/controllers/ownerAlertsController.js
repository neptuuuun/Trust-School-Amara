/**
 * Owner alerts engine (Phase 4, §12) — decision-support edition. Owner-only
 * (requireOwner), cross-branch.
 *
 * Each alert is not just "what happened" but a compact decision unit:
 *   • summary            — executive one-liner (the what)
 *   • metrics[]          — the key numbers, as {label, value} chips
 *   • rootCause          — why the system believes this fired, from the actual data
 *   • businessImpact     — the consequence of inaction (+ impactType risk tag)
 *   • recommendedActions — practical, data-specific next steps ({label, link})
 *   • entity{type,name}  — the related branch / group / teacher, when applicable
 *   • branchName, date, month, severity — for the card header
 *
 * ALERT CLASSES — the two behave differently ON PURPOSE:
 *
 *   STATE-BASED (revenue_drop, revenue_shortfall, group_retention,
 *   teacher_retention, churn) describe a condition that is true RIGHT NOW. They
 *   are recomputed from scratch on every request and MUST disappear on their own
 *   the moment the underlying condition stops holding. Nothing about them is
 *   stored, cached or acknowledged.
 *
 *   EVENT-BASED (sensitive_audit) is a historical record — "N payments were
 *   deleted in the last 30 days". It is derived from the immutable /auditLogs
 *   and correctly persists until its time window rolls past the event.
 *
 * LIVE-STATE RULE (the fix for stale alerts)
 * ------------------------------------------
 * Every state-based input is passed through services/liveStateService:
 *
 *   • Revenue / paying students come from the ledger window with REVERSED and
 *     ORPHANED entries projected out, so a deleted registration or payment stops
 *     counting immediately — no matter which channel deleted it (admin UI,
 *     cascade, or the Firebase console).
 *   • "Enrolled" comes from a live count of the approved archives, NOT from the
 *     denormalized `classes/{id}.enrollmentCount` counter, which drifts whenever
 *     a record is removed outside the increment/decrement paths.
 *
 * Reading a stale counter on the expected side AND a never-shrinking ledger on
 * the actual side is what previously froze the collection-gap alert: both halves
 * of `expected vs actual` were immune to deletions, so the gap never moved.
 *
 * Cost: one windowed ledger fetch (prev + current month) + one batched liveness
 * check + one classes read + three archive reads per branch + one audit window.
 * NO new indexes: reuses (branchId, paidAt) on /ledger and (branchId, at) on
 * /auditLogs.
 *
 * Tunable thresholds live as top-level constants so the owner's "what counts as
 * a problem" can be adjusted in one place.
 */

const { admin, db } = require('../config/firebase');
const H = require('../services/analyticsHelpers');
const live = require('../services/liveStateService');

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
const branchName = (b) => H.BRANCH_NAMES[b] || b;

// ── GET /api/owner/alerts?month=&branchId= ─────────────────────────────────────
const getAlerts = async (req, res, next) => {
  try {
    const generatedAt = new Date().toISOString();
    const branchId = branchFilter(req.query.branchId);
    const branches = branchId ? [branchId] : H.BRANCHES;
    const { key, start, end } = H.monthBounds(req.query.month);
    const prevKey = H.shiftMonth(key, -1);
    const prevStart = H.monthBounds(prevKey).start;

    // One ledger window (prev + current month) per branch powers revenue MoM,
    // expected-vs-actual, and group/teacher/churn retention.
    //
    // Every window is projected onto LIVE entries first: reversed entries and
    // entries whose source registration/payment no longer exists are dropped, so
    // a deletion is reflected on the very next request with no manual step.
    const windowByBranch = {};
    const liveEnrollByBranch = {};
    const ledgerStats = {};
    await Promise.all(branches.map(async (b) => {
      const [raw, enrol] = await Promise.all([
        H.loadLedgerWindow(prevStart, end, b),
        live.loadLiveClassEnrollment(b),
      ]);
      const { entries, stats } = await live.filterLiveEntries(raw);
      windowByBranch[b] = entries;
      liveEnrollByBranch[b] = enrol;
      ledgerStats[b] = stats;
    }));

    // Only a positive, still-live entry makes a student a "payer" this month. A
    // negative adjustment must never mark someone as having paid.
    const isPayment = (e) => Boolean(e.studentId) && H.num(e.amount) > 0;

    const alerts = [];
    const push = (a) => alerts.push(a);

    // 1 ── Revenue drop (MoM): per-branch + overall ───────────────────────────────
    let totalThis = 0, totalPrev = 0;
    const branchDrop = []; // { b, name, thisRev, prevRev, dropPct, left, payThis, payLast }
    for (const b of branches) {
      let thisRev = 0, prevRev = 0;
      const payThis = new Set(), payLast = new Set();
      for (const e of windowByBranch[b] || []) {
        const m = H.entryMonth(e);
        if (m === key)      { thisRev += H.num(e.amount); if (isPayment(e)) payThis.add(e.studentId); }
        else if (m === prevKey) { prevRev += H.num(e.amount); if (isPayment(e)) payLast.add(e.studentId); }
      }
      totalThis += thisRev; totalPrev += prevRev;
      let left = 0; payLast.forEach((s) => { if (!payThis.has(s)) left += 1; });
      const dropPct = prevRev > 0 ? Math.round(((prevRev - thisRev) / prevRev) * 1000) / 10 : 0;
      branchDrop.push({ b, name: branchName(b), thisRev, prevRev, dropPct, left, payThis: payThis.size, payLast: payLast.size });

      if (prevRev > 0 && dropPct >= REVENUE_DROP_PCT) {
        const gap = prevRev - thisRev;
        const name = branchName(b);
        const rootCause = left > 0
          ? `عدد الطلاب الدافعين انخفض من ${payLast.size} إلى ${payThis.size} — توقف ${left} طالباً عن الدفع مقارنة بالشهر السابق. الانخفاض مدفوع بتسرّب الطلاب أو تراجع التسجيلات الجديدة.`
          : `عدد الطلاب الدافعين شبه ثابت (${payLast.size} ← ${payThis.size}) بينما انخفض الإيراد — الأرجح مدفوعات متأخرة أو تعديلات على الدفعات أكثر من فقدان طلاب.`;
        push({
          id: `revdrop-${b}-${key}`,
          severity: dropPct >= REVENUE_DROP_CRITICAL ? 'critical' : 'warning',
          type: 'revenue_drop',
          title: `انخفاض إيرادات ${name}`,
          summary: `إيرادات فرع ${name} انخفضت ${dropPct}% مقارنة بالشهر السابق (${fmtDZ(prevRev)} ← ${fmtDZ(thisRev)} دج).`,
          branchId: b,
          entity: { type: 'branch', name },
          metrics: [
            { label: 'الانخفاض', value: `${dropPct}%` },
            { label: 'هذا الشهر', value: `${fmtDZ(thisRev)} دج` },
            { label: 'الشهر السابق', value: `${fmtDZ(prevRev)} دج` },
            { label: 'توقفوا عن الدفع', value: `${left}` },
          ],
          rootCause,
          impactType: 'revenue_loss',
          businessImpact: `فجوة ${fmtDZ(gap)} دج هذا الشهر. استمرار الانخفاض يقلّص الإيراد المتكرر ويضغط على التدفق النقدي للفرع وقدرته على تغطية أجور الأساتذة.`,
          recommendedActions: [
            { label: `قارن أداء فرع ${name}`, link: '/owner/branches' },
            { label: 'افتح تفصيل الإيرادات', link: '/owner/revenue' },
            left > 0
              ? { label: 'راجع تسرّب الطلاب والاحتفاظ', link: '/owner/retention' }
              : { label: 'راجع تعديلات المدفوعات في سجل التدقيق', link: '/owner/audit' },
            { label: `تواصل مع مسؤول فرع ${name}`, link: '/owner/team' },
          ],
          value: dropPct,
          link: '/owner/revenue',
        });
      }
    }
    if (!branchId && totalPrev > 0) {
      const dropPct = Math.round(((totalPrev - totalThis) / totalPrev) * 1000) / 10;
      if (dropPct >= REVENUE_DROP_PCT) {
        const gap = totalPrev - totalThis;
        const totalLeft = branchDrop.reduce((a, x) => a + x.left, 0);
        const worst = branchDrop.filter((x) => x.prevRev > 0).sort((a, b) => b.dropPct - a.dropPct)[0];
        push({
          id: `revdrop-all-${key}`,
          severity: dropPct >= REVENUE_DROP_CRITICAL ? 'critical' : 'warning',
          type: 'revenue_drop',
          title: 'انخفاض الإيرادات الإجمالية',
          summary: `إجمالي الإيرادات عبر كل الفروع انخفض ${dropPct}% مقارنة بالشهر السابق (${fmtDZ(totalPrev)} ← ${fmtDZ(totalThis)} دج).`,
          entity: null,
          metrics: [
            { label: 'الانخفاض', value: `${dropPct}%` },
            { label: 'هذا الشهر', value: `${fmtDZ(totalThis)} دج` },
            { label: 'الشهر السابق', value: `${fmtDZ(totalPrev)} دج` },
            { label: 'توقفوا عن الدفع', value: `${totalLeft}` },
          ],
          rootCause: worst
            ? `أكبر مساهم في الانخفاض هو فرع ${worst.name} (انخفاض ${worst.dropPct}%). إجمالاً توقف ${totalLeft} طالباً عن الدفع مقارنة بالشهر السابق.`
            : `توقف ${totalLeft} طالباً عن الدفع مقارنة بالشهر السابق عبر الفروع.`,
          impactType: 'cashflow',
          businessImpact: `فجوة ${fmtDZ(gap)} دج على مستوى المدرسة هذا الشهر — ضغط مباشر على التدفق النقدي والقدرة على تغطية النفقات الثابتة.`,
          recommendedActions: [
            { label: 'قارن أداء الفروع', link: '/owner/branches' },
            { label: 'افتح تفصيل الإيرادات', link: '/owner/revenue' },
            { label: 'راجع الاحتفاظ والتسرّب', link: '/owner/retention' },
          ],
          value: dropPct,
          link: '/owner/branches',
        });
      }
    }

    // 2 ── Per-class: expected-vs-actual shortfall + group losing students ────────
    for (const b of branches) {
      const classesSnap = await db.collection('branches').doc(b).collection('classes').get();
      const name = branchName(b);
      const liveByClass = liveEnrollByBranch[b].byClass;

      // Index ledger by classId → paying sets (this/last) + actual revenue this month.
      const byClass = {};
      for (const e of windowByBranch[b] || []) {
        if (!e.classId) continue;
        const m = H.entryMonth(e);
        const slot = byClass[e.classId] || (byClass[e.classId] = { thisMonth: new Set(), lastMonth: new Set(), actualThis: 0 });
        if (m === key) { slot.actualThis += H.num(e.amount); if (isPayment(e)) slot.thisMonth.add(e.studentId); }
        else if (m === prevKey && isPayment(e)) slot.lastMonth.add(e.studentId);
      }

      classesSnap.docs.forEach((d) => {
        const c = d.data() || {};
        if ((c.status || 'active') === 'inactive') return;
        const slot = byClass[d.id] || { thisMonth: new Set(), lastMonth: new Set(), actualThis: 0 };
        const monthlyFee = H.num(c.price ?? c.monthlyPrice);
        // LIVE seat count from the approved archives — NOT c.enrollmentCount, which
        // survives deletions made outside the increment/decrement write paths and
        // would keep `expected` (and therefore the gap) frozen forever.
        const enrolled = (liveByClass.get(d.id) || new Set()).size;
        const expected = enrolled * monthlyFee;
        const actual = slot.actualThis;
        const groupName = c.groupName || c.name || c.subjectName || '—';
        const teacherName = (c.teacherName || '').trim();

        // Expected vs actual mismatch.
        if (expected > 0 && actual < expected * EXPECTED_ACTUAL_RATIO) {
          const gap = expected - actual;
          const paidCount = slot.thisMonth.size;
          const unpaid = Math.max(0, enrolled - paidCount);
          push({
            id: `gap-${b}-${d.id}-${key}`,
            severity: actual <= expected * SHORTFALL_CRITICAL ? 'critical' : 'warning',
            type: 'revenue_shortfall',
            title: `عجز تحصيل: ${groupName}`,
            summary: `مجموعة "${groupName}" (${name}) حصّلت ${fmtDZ(actual)} دج من أصل ${fmtDZ(expected)} دج متوقع — عجز ${fmtDZ(gap)} دج.`,
            branchId: b,
            entity: { type: 'group', name: groupName },
            metrics: [
              { label: 'العجز', value: `${fmtDZ(gap)} دج` },
              { label: 'دفعوا', value: `${paidCount}/${enrolled}` },
              { label: 'المتوقع', value: `${fmtDZ(expected)} دج` },
            ],
            rootCause: `من أصل ${enrolled} طالباً مسجّلاً، دفع ${paidCount} فقط هذا الشهر — ${unpaid} طالباً لم يدفعوا بعد (الرسم ${fmtDZ(monthlyFee)} دج للطالب).${teacherName ? ` أستاذ المجموعة: ${teacherName}.` : ''}`,
            impactType: 'cashflow',
            businessImpact: `عجز ${fmtDZ(gap)} دج هذا الشهر. إن لم يُحصّل قد يتحوّل إلى خسارة دائمة ويؤثر على أجور الأساتذة والتدفق النقدي للفرع.`,
            recommendedActions: [
              { label: 'افتح تفاصيل المجموعات', link: '/owner/groups' },
              { label: 'راجع الطلاب المتأخرين عن الدفع', link: '/owner/students' },
              { label: `تواصل مع مسؤول فرع ${name} للتحصيل`, link: '/owner/team' },
            ],
            value: gap,
            link: '/owner/groups',
          });
        }

        // Group losing students (retention < threshold, with a meaningful prior cohort).
        if (slot.lastMonth.size >= MIN_PRIOR_STUDENTS) {
          let retained = 0; slot.lastMonth.forEach((s) => { if (slot.thisMonth.has(s)) retained += 1; });
          const retentionRate = Math.round((retained / slot.lastMonth.size) * 1000) / 10;
          if (retentionRate < GROUP_RETENTION_MIN) {
            const prior = slot.lastMonth.size;
            const lost = prior - retained;
            push({
              id: `grouploss-${b}-${d.id}-${key}`,
              severity: retentionRate < RETENTION_CRITICAL ? 'critical' : 'warning',
              type: 'group_retention',
              title: `تسرّب من مجموعة: ${groupName}`,
              summary: `مجموعة "${groupName}" (${name}) احتفظت بـ ${retentionRate}% فقط — غادر ${lost} من ${prior} طالباً.`,
              branchId: b,
              entity: { type: 'group', name: groupName },
              metrics: [
                { label: 'الاحتفاظ', value: `${retentionRate}%` },
                { label: 'غادروا', value: `${lost}/${prior}` },
              ],
              rootCause: `غادر ${lost} من ${prior} طالباً كانوا يدفعون الشهر السابق (احتفاظ ${retentionRate}%).${teacherName ? ` أستاذ المجموعة: ${teacherName} —` : ''} قد يشير إلى جودة التدريس أو توقيت الحصص أو المنافسة.`,
              impactType: 'retention',
              businessImpact: `تسرّب الطلاب يقلّص الإيراد المتكرر ويصعب تعويضه؛ استمراره يهدّد جدوى استمرار المجموعة.`,
              recommendedActions: [
                { label: 'افتح تحليل المجموعات', link: '/owner/groups' },
                ...(teacherName ? [{ label: `راجع أداء الأستاذ ${teacherName}`, link: '/owner/teachers' }] : []),
                { label: `تواصل مع مسؤول فرع ${name}`, link: '/owner/team' },
              ],
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
        if (!name || !isPayment(e)) continue;
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
        const prior = t.payingLast.size;
        const lost = prior - retained;
        const singleBranch = t.branches.size === 1 ? Array.from(t.branches)[0] : undefined;
        const branchLabel = singleBranch ? branchName(singleBranch) : 'عدة فروع';
        push({
          id: `teacher-${name}-${key}`,
          severity: retentionRate < RETENTION_CRITICAL ? 'critical' : 'warning',
          type: 'teacher_retention',
          title: `احتفاظ منخفض: الأستاذ ${name}`,
          summary: `الأستاذ ${name} احتفظ بـ ${retentionRate}% فقط من طلابه الدافعين الشهر السابق (${prior} طالب).`,
          branchId: singleBranch,
          entity: { type: 'teacher', name },
          metrics: [
            { label: 'الاحتفاظ', value: `${retentionRate}%` },
            { label: 'غادروا', value: `${lost}/${prior}` },
            { label: 'النطاق', value: branchLabel },
          ],
          rootCause: `احتفظ الأستاذ بـ ${retained} من ${prior} طالباً فقط (احتفاظ ${retentionRate}%). قد يعكس ذلك جودة التدريس أو رضا الطلاب أو ظروف المجموعة والتوقيت.`,
          impactType: 'retention',
          businessImpact: `الأساتذة هم المنتج الأساسي؛ استمرار تسرّب طلاب أستاذ معيّن يعني خسارة إيراد متكرر ومخاطرة على سمعة المدرسة.`,
          recommendedActions: [
            { label: 'افتح أداء الأساتذة', link: '/owner/teachers' },
            { label: 'راجع مجموعات هذا الأستاذ', link: '/owner/groups' },
            { label: 'ناقش الأمر مع مسؤول الفرع', link: '/owner/team' },
          ],
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
        summary: `${deletes} عملية حذف دفعة خلال آخر ${SENSITIVE_AUDIT_DAYS} يوم — تحتاج مراجعة فورية.`,
        entity: null,
        metrics: [
          { label: 'عمليات حذف', value: `${deletes}` },
          { label: 'النافذة', value: `${SENSITIVE_AUDIT_DAYS} يوم` },
        ],
        rootCause: `سجّل نظام التدقيق ${deletes} عملية حذف لسجلات دفع خلال آخر ${SENSITIVE_AUDIT_DAYS} يوم. قد تكون تصحيحات مشروعة، أو مؤشراً على تلاعب مالي يستحق التحقق.`,
        impactType: 'fraud',
        businessImpact: `حذف المدفوعات دون رقابة يفتح باب الاحتيال وفقدان الإيراد ويُضعف موثوقية السجلات المالية والمحاسبة.`,
        recommendedActions: [
          { label: 'افتح سجل التدقيق', link: '/owner/audit' },
          { label: 'حدّد الموظف والفرع المسؤولين عن الحذف', link: '/owner/audit' },
        ],
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
        summary: `${edits} عملية تعديل دفعة خلال آخر ${SENSITIVE_AUDIT_DAYS} يوم — يُنصح بمراجعتها.`,
        entity: null,
        metrics: [
          { label: 'عمليات تعديل', value: `${edits}` },
          { label: 'النافذة', value: `${SENSITIVE_AUDIT_DAYS} يوم` },
        ],
        rootCause: `سجّل نظام التدقيق ${edits} عملية تعديل على مبالغ الدفع خلال آخر ${SENSITIVE_AUDIT_DAYS} يوم. التعديلات المتكررة قد تخفي أخطاءً أو تلاعباً في التحصيل.`,
        impactType: 'fraud',
        businessImpact: `تعديل مبالغ المدفوعات بكثرة يصعّب تدقيق الإيراد الحقيقي ويزيد مخاطر التسرّب المالي غير المكتشف.`,
        recommendedActions: [
          { label: 'افتح سجل التدقيق', link: '/owner/audit' },
          { label: 'راجع التعديلات حسب الموظف', link: '/owner/audit' },
        ],
        value: edits,
        link: '/owner/audit',
      });
    }

    // 5 ── Rising/high churn: support students who stopped paying this month ──────
    const supportPrev = new Set(), supportThis = new Set();
    for (const b of branches) {
      for (const e of windowByBranch[b] || []) {
        if (e.serviceType !== 'support' || !isPayment(e)) continue;
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
        summary: `${left} طالب دعم توقفوا عن الدفع هذا الشهر${churnPct != null ? ` (${churnPct}% من طلاب الشهر السابق)` : ''}.`,
        entity: null,
        metrics: [
          { label: 'المغادرون', value: `${left}` },
          ...(churnPct != null ? [{ label: 'النسبة', value: `${churnPct}%` }] : []),
          { label: 'قاعدة الشهر السابق', value: `${supportPrev.size}` },
        ],
        rootCause: `${left} من ${supportPrev.size} طالب دعم كانوا يدفعون الشهر السابق لم يدفعوا هذا الشهر${churnPct != null ? ` (${churnPct}%)` : ''}. قد يرتبط بانتهاء الحاجة للدعم، أو السعر، أو جودة الخدمة، أو ضعف المتابعة.`,
        impactType: 'retention',
        businessImpact: `التسرّب المرتفع يقلّص قاعدة الإيراد المتكرر ويرفع تكلفة اكتساب طلاب بدلاء لتعويض الفاقد.`,
        recommendedActions: [
          { label: 'افتح الاحتفاظ والنمو', link: '/owner/retention' },
          { label: 'راجع الطلاب المغادرين', link: '/owner/students' },
          { label: 'قارن الفروع لتحديد مصدر التسرّب', link: '/owner/branches' },
        ],
        value: left,
        link: '/owner/retention',
      });
    }

    // Enrich every alert with header metadata (branch label, date, month) and keep
    // a `message` alias for backward compatibility with older clients.
    alerts.forEach((a) => {
      a.date = generatedAt;
      a.month = key;
      a.branchName = a.branchId ? branchName(a.branchId) : 'كل الفروع';
      if (!a.message) a.message = a.summary;
    });

    // Sort: severity (critical → info), then magnitude.
    alerts.sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      return s !== 0 ? s : (H.num(b.value) - H.num(a.value));
    });

    const counts = { critical: 0, warning: 0, info: 0 };
    alerts.forEach((a) => { counts[a.severity] = (counts[a.severity] || 0) + 1; });

    // Provenance: makes it verifiable that this response was computed fresh, and
    // surfaces ledger drift (orphans = entries whose source record was deleted
    // without a reversal — run scripts/reconcile-ledger.js to heal them).
    const drift = Object.values(ledgerStats).reduce((a, s) => ({
      total: a.total + s.total,
      live: a.live + s.live,
      reversed: a.reversed + s.reversed,
      orphaned: a.orphaned + s.orphaned,
      unresolved: a.unresolved + s.unresolved,
    }), { total: 0, live: 0, reversed: 0, orphaned: 0, unresolved: 0 });

    return res.json({
      generatedAt,
      month: key,
      branchId: branchId || 'all',
      counts: { ...counts, total: alerts.length },
      alerts,
      source: {
        // Every state-based alert above was derived from these entries only.
        computed: 'live',
        cached: false,
        ledgerEntries: drift,
      },
    });
  } catch (err) { next(err); }
};

module.exports = { getAlerts };
