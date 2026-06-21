/**
 * Audit-log service — the permanent, append-only record of every important
 * action. Written ONLY by the Express backend (Admin SDK); Firestore rules deny
 * all client writes. Nothing happens silently.
 *
 * Entry shape:
 *   {
 *     branchId,
 *     actor: { uid, email, role },
 *     action: 'student.create'|'student.update'|'student.delete'|
 *             'payment.verify'|'payment.reject'|'payment.edit'|'payment.delete'|
 *             'group.create'|'group.update'|'teacher.assign'|'document.approve'|...,
 *     targetType, targetId,
 *     before (map|null), after (map|null),   // payment.edit/delete carry amounts
 *     reason (string|null),
 *     at (serverTimestamp)
 *   }
 *
 * Best-effort: a failed audit write must never break the underlying operation,
 * so writeAudit swallows errors (logging them) and returns null on failure.
 */

const { admin, db } = require('../config/firebase');

const FieldValue = admin.firestore.FieldValue;
const AUDIT_LOGS = 'auditLogs';

/** Strip undefined values — Firestore rejects undefined in a document. */
function clean(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// Short-lived in-process cache of resolved actor identities, keyed by uid, so we
// don't re-read admins/{uid} on every logged action within a single process.
const _actorCache = new Map();
const ACTOR_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve the canonical actor identity from the authoritative admins/owners docs,
 * so every audit entry and provenance field carries the employee's real NAME (not
 * just a uid). Controllers should spread this into the `actor` they pass to
 * writeAudit: `actor: await resolveActor(req.user.uid)`.
 *
 * @returns {Promise<{uid, name, email, role}>}
 */
async function resolveActor(uid) {
  if (!uid) return { uid: '', name: '', email: '', role: 'unknown' };

  const cached = _actorCache.get(uid);
  if (cached && cached.expires > Date.now()) return cached.actor;

  let actor = { uid, name: '', email: '', role: 'unknown' };
  try {
    const adminSnap = await db.collection('admins').doc(uid).get();
    if (adminSnap.exists) {
      const d = adminSnap.data() || {};
      actor = { uid, name: d.name || '', email: d.email || '', role: 'admin' };
    } else {
      const ownerSnap = await db.collection('owners').doc(uid).get();
      if (ownerSnap.exists) {
        const o = ownerSnap.data() || {};
        actor = { uid, name: o.name || '', email: o.email || '', role: 'owner' };
      }
    }
  } catch (e) {
    console.warn('[audit] resolveActor failed:', e.message);
  }

  _actorCache.set(uid, { actor, expires: Date.now() + ACTOR_TTL_MS });
  return actor;
}

async function writeAudit({
  branchId = null,
  actor = null,
  action,
  targetType = null,
  targetId = null,
  before = null,
  after = null,
  reason = null,
} = {}) {
  if (!action) {
    console.error('[audit] writeAudit called without an action — skipping');
    return null;
  }
  try {
    // Backfill the actor's display NAME from the authoritative admins/owners doc
    // so every entry records WHO performed the action by name — even when the
    // caller only had { uid, email, role }. This is the core attribution guarantee.
    let entryActor = actor ? { ...actor } : { role: 'system' };
    if (entryActor.uid && !entryActor.name) {
      const resolved = await resolveActor(entryActor.uid);
      entryActor = { ...resolved, ...entryActor };
      if (!entryActor.name)  entryActor.name  = resolved.name;
      if (!entryActor.email) entryActor.email = resolved.email;
      if (!entryActor.role || entryActor.role === 'unknown') entryActor.role = resolved.role;
    }

    const ref = await db.collection(AUDIT_LOGS).add({
      branchId,
      actor: clean(entryActor),
      action,
      targetType,
      targetId,
      before: clean(before),
      after: clean(after),
      reason,
      at: FieldValue.serverTimestamp(),
    });

    // Phase 5 rollup: denormalize a "last activity" stamp onto the admin doc so
    // productivity/last-seen views don't have to scan the whole log. Best-effort.
    if (entryActor && entryActor.uid && entryActor.role === 'admin') {
      db.collection('admins').doc(entryActor.uid).set({
        lastActivityAt:   FieldValue.serverTimestamp(),
        lastActivityType: action,
      }, { merge: true }).catch(() => {});
    }

    return ref.id;
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
    return null;
  }
}

module.exports = { AUDIT_LOGS, writeAudit, resolveActor };
