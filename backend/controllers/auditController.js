/**
 * Per-entity audit history (Record-level accountability layer).
 *
 * GET /api/audit/history?targetType=&targetId=&branchId=&limit=
 *   Returns the immutable auditLogs for ONE entity, newest → oldest, so any
 *   record can show its full "who changed what, when" timeline.
 *
 * Authorization (enforced here, not by middleware, because the access rule
 * depends on the record's branch):
 *   • Owner  → any branch.
 *   • Admin  → ONLY their own branch (branchId is required and must match).
 *
 * The raw before/after snapshots are returned as-is; the frontend computes the
 * field-level diff with the shared `diffFields` util so there is one diff
 * implementation across the feed and the history panel.
 */

const { admin, db } = require('../config/firebase');
const { isAdmin } = require('../middleware/auth');

const toISO = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : null);

/**
 * Decide whether the caller may read this entity's history.
 * Pure-ish (takes an `owner` boolean + an isAdmin probe) so it is unit-testable.
 * @returns {Promise<{ok:boolean, status?:number, code?:string}>}
 */
async function authorizeHistory({ isOwner, uid, email, branchId, isAdminFn }) {
  if (isOwner) return { ok: true };
  if (!branchId) return { ok: false, status: 400, code: 'missing-branch' };
  const ok = await isAdminFn(uid, email, branchId);
  return ok ? { ok: true } : { ok: false, status: 403, code: 'permission-denied' };
}

const getEntityHistory = async (req, res, next) => {
  try {
    const targetType = req.query.targetType || null;
    const targetId = req.query.targetId || null;
    const branchId = req.query.branchId || null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    if (!targetId) return res.status(400).json({ code: 'missing-target', message: 'targetId is required.' });

    const uid = req.user.uid;
    const email = req.user.email || '';

    let isOwner = false;
    try { isOwner = (await db.collection('owners').doc(uid).get()).exists; } catch {}

    const authz = await authorizeHistory({ isOwner, uid, email, branchId, isAdminFn: isAdmin });
    if (!authz.ok) {
      return res.status(authz.status).json({
        code: authz.code,
        message: authz.code === 'missing-branch' ? 'branchId is required.' : 'Access denied.',
      });
    }

    // Immutable audit log for this entity, newest first.
    // Needs composite index auditLogs (targetId ASC, at DESC).
    const snap = await db.collection('auditLogs')
      .where('targetId', '==', targetId)
      .orderBy('at', 'desc')
      .limit(limit)
      .get();

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

    // Defensive narrowing: ids can repeat across branches/types, and an admin
    // must never see another branch's entries even if a collision occurs.
    if (targetType) rows = rows.filter((r) => !r.targetType || r.targetType === targetType);
    if (!isOwner && branchId) rows = rows.filter((r) => !r.branchId || r.branchId === branchId);

    return res.json({ targetId, targetType, count: rows.length, entries: rows });
  } catch (err) { next(err); }
};

module.exports = { getEntityHistory, authorizeHistory };
