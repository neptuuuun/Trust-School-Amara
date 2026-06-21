/**
 * Owner audit & admin-activity analytics (Phase 3). Owner-only (requireOwner).
 *
 * Reads the immutable `auditLogs` collection (every important action is logged
 * there with a name-attributed actor). The audit-log viewer streams recent
 * entries with filters; admin-activity aggregates per-employee counts so the
 * owner sees who created students, registered payments, managed groups, etc.
 */

const { admin, db } = require('../config/firebase');
const H = require('../services/analyticsHelpers');

const Timestamp = admin.firestore.Timestamp;
const branchFilter = (q) => (H.BRANCHES.includes(q) ? q : null);
const toISO = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : null);

// Categorize an audit action into an admin-performance bucket.
function bucketFor(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'student.create') return 'studentsCreated';
  if (a.startsWith('payment.')) return 'paymentsRegistered';       // verify/reject/edit/delete
  if (a === 'document.approve' || a === 'verification.approve') return 'documentsApproved';
  if (a.startsWith('group.') || a === 'teacher.assign') return 'groupsManaged';
  return null;
}

// ── GET /api/owner/audit?branchId=&action=&actorUid=&days=&limit= ──────────────
const getAuditLog = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const action = req.query.action || null;
    const actorUid = req.query.actorUid || null;
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 150));
    const since = new Date(Date.now() - days * 86400000);

    // Branch-scoped uses the (branchId, at) index; otherwise a plain at-desc scan.
    let q = db.collection('auditLogs').where('at', '>=', Timestamp.fromDate(since));
    if (branchId) q = q.where('branchId', '==', branchId);
    q = q.orderBy('at', 'desc').limit(limit);

    const snap = await q.get();
    let rows = snap.docs.map((d) => {
      const x = d.data() || {};
      return {
        id: d.id,
        at: toISO(x.at),
        branchId: x.branchId || null,
        actor: x.actor || null,
        action: x.action || null,
        targetType: x.targetType || null,
        targetId: x.targetId || null,
        before: x.before || null,
        after: x.after || null,
        reason: x.reason || null,
      };
    });

    // In-memory filters (avoid extra composite indexes for optional facets).
    if (action) rows = rows.filter((r) => r.action === action);
    if (actorUid) rows = rows.filter((r) => r.actor && r.actor.uid === actorUid);

    // Distinct action list (for the viewer's filter dropdown).
    const actions = Array.from(new Set(snap.docs.map((d) => (d.data() || {}).action).filter(Boolean))).sort();

    return res.json({ branchId: branchId || 'all', days, count: rows.length, actions, entries: rows });
  } catch (err) { next(err); }
};

// ── GET /api/owner/admin-activity?branchId=&days= ──────────────────────────────
const getAdminActivity = async (req, res, next) => {
  try {
    const branchId = branchFilter(req.query.branchId);
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
    const since = new Date(Date.now() - days * 86400000);

    // All admins (the roster), then aggregate their audit actions.
    const adminsSnap = await db.collection('admins').get();
    const byUid = {};
    adminsSnap.docs.forEach((d) => {
      const x = d.data() || {};
      if (branchId && x.branchId !== branchId) return;
      byUid[d.id] = {
        uid: d.id,
        name: x.name || x.email || '—',
        email: x.email || null,
        branchId: x.branchId || null,
        branchName: x.branchName || H.BRANCH_NAMES[x.branchId] || x.branchId || null,
        active: x.active !== false,
        studentsCreated: 0, paymentsRegistered: 0, documentsApproved: 0, groupsManaged: 0,
        totalActions: 0,
        lastActivity: toISO(x.lastActivityAt),
      };
    });

    let q = db.collection('auditLogs').where('at', '>=', Timestamp.fromDate(since));
    if (branchId) q = q.where('branchId', '==', branchId);
    const logs = await q.get();

    logs.docs.forEach((d) => {
      const x = d.data() || {};
      const uid = x.actor && x.actor.uid;
      if (!uid) return;
      // Skip owner-initiated actions (admin.* lifecycle) — those are owner activity.
      const row = byUid[uid];
      if (!row) return; // actor not in the admin roster (e.g. owner) → not an admin stat
      const bucket = bucketFor(x.action);
      if (bucket) row[bucket] += 1;
      row.totalActions += 1;
      const at = toISO(x.at);
      if (at && (!row.lastActivity || at > row.lastActivity)) row.lastActivity = at;
    });

    const rows = Object.values(byUid).sort((a, b) => b.totalActions - a.totalActions);
    return res.json({ branchId: branchId || 'all', days, admins: rows });
  } catch (err) { next(err); }
};

module.exports = { getAuditLog, getAdminActivity };
