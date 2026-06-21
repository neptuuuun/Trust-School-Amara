/**
 * Owner admin-management — the ONLY way admin (employee) accounts are created,
 * deactivated, or reactivated. Owner-only (requireOwner); writes the
 * client-write-protected `admins` collection via the Admin SDK.
 *
 * Every lifecycle action is attributed to the acting OWNER:
 *   - the admin doc is stamped with a canonical { uid, name, email } actor
 *     (createdBy / deactivatedBy / reactivatedBy),
 *   - and an immutable `auditLogs` entry is written (admin.create | admin.deactivate
 *     | admin.reactivate) recording who did it.
 *
 * Deactivation revokes access at every layer: `active:false` (Firestore rules
 * `isActiveAdmin`, backend `resolveAdminBranch`, and the frontend admin guards all
 * deny it) PLUS the Firebase Auth account is disabled so existing tokens stop
 * refreshing. Reactivation reverses both.
 */

const { admin, db, auth } = require('../config/firebase');
const { writeAudit } = require('../services/auditService');

const FieldValue = admin.firestore.FieldValue;
const VALID_BRANCHES = ['boumerdes', 'bordj_menaiel'];
const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };

/** Canonical { uid, name, email, role } for the acting owner (set by requireOwner). */
function ownerActor(req) {
  const o = req.owner || {};
  return { uid: o.uid || req.user?.uid || '', name: o.name || '', email: o.email || req.user?.email || '', role: 'owner' };
}

const toISO = (ts) =>
  ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : null;

function adminView(id, x = {}) {
  return {
    uid: id,
    name: x.name || '',
    email: x.email || '',
    role: x.role || 'admin',
    branchId: x.branchId || null,
    branchName: x.branchName || null,
    active: x.active !== false,
    createdAt: toISO(x.createdAt),
    createdBy: x.createdBy || null,
    deactivatedAt: toISO(x.deactivatedAt),
    lastActivityAt: toISO(x.lastActivityAt),
    lastActivityType: x.lastActivityType || null,
  };
}

// ── GET /api/owner/admins ───────────────────────────────────────────────────────
const listAdmins = async (_req, res, next) => {
  try {
    const snap = await db.collection('admins').get();
    const admins = snap.docs.map((d) => adminView(d.id, d.data() || {}));
    return res.json({ admins });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/owner/admins  { email, name, branchId, password? } ─────────────────
const createAdmin = async (req, res, next) => {
  try {
    const email    = String(req.body.email || '').trim().toLowerCase();
    const name     = String(req.body.name  || '').trim();
    const branchId = String(req.body.branchId || '').trim();
    const password = req.body.password;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ code: 'invalid-argument', message: 'A valid email is required.' });
    if (!name)
      return res.status(400).json({ code: 'invalid-argument', message: 'name is required.' });
    if (!VALID_BRANCHES.includes(branchId))
      return res.status(400).json({ code: 'invalid-argument', message: `branchId must be one of: ${VALID_BRANCHES.join(', ')}` });

    // Reuse an existing Auth user, or create one (password required to create).
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      if (password && password.length >= 6) await auth.updateUser(userRecord.uid, { password, disabled: false });
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      if (!password || password.length < 6)
        return res.status(400).json({ code: 'invalid-argument', message: 'password (min 6 chars) is required to create a new account.' });
      userRecord = await auth.createUser({ email, password, displayName: name, emailVerified: true });
    }

    const uid = userRecord.uid;

    // Refuse to silently overwrite an existing admin.
    const existing = await db.collection('admins').doc(uid).get();
    if (existing.exists)
      return res.status(409).json({ code: 'already-exists', message: 'هذا الحساب مدير بالفعل.' });

    const actor = ownerActor(req);
    await db.collection('admins').doc(uid).set({
      uid,
      name,
      email,
      role: 'admin',
      branchId,
      branchName: BRANCH_NAMES[branchId] || branchId,
      active: true,
      createdBy: actor,                       // canonical { uid, name, email } owner stamp
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeAudit({
      branchId,
      actor,
      action: 'admin.create',
      targetType: 'admin',
      targetId: uid,
      after: { name, email, branchId },
    });

    return res.status(201).json({ uid });
  } catch (err) {
    next(err);
  }
};

// ── Shared deactivate/reactivate handler ─────────────────────────────────────────
async function setAdminActive(req, res, next, makeActive) {
  try {
    const uid = req.params.uid;
    if (!uid) return res.status(400).json({ code: 'invalid-argument', message: 'uid is required.' });

    const ref  = db.collection('admins').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ code: 'not-found', message: 'Admin not found.' });

    const data  = snap.data() || {};
    const actor = ownerActor(req);

    const patch = makeActive
      ? { active: true,  reactivatedBy: actor, reactivatedAt: FieldValue.serverTimestamp(), deactivatedBy: null, deactivatedAt: null, updatedAt: FieldValue.serverTimestamp() }
      : { active: false, deactivatedBy: actor, deactivatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };

    await ref.set(patch, { merge: true });
    // Mirror the state onto the Auth account so existing sessions can't refresh.
    await auth.updateUser(uid, { disabled: !makeActive }).catch(() => {});

    await writeAudit({
      branchId: data.branchId || null,
      actor,
      action: makeActive ? 'admin.reactivate' : 'admin.deactivate',
      targetType: 'admin',
      targetId: uid,
      before: { active: data.active !== false },
      after:  { active: makeActive },
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/owner/admins/:uid/deactivate ──────────────────────────────────────
const deactivateAdmin = (req, res, next) => setAdminActive(req, res, next, false);

// ── PATCH /api/owner/admins/:uid/reactivate ──────────────────────────────────────
const reactivateAdmin = (req, res, next) => setAdminActive(req, res, next, true);

module.exports = { listAdmins, createAdmin, deactivateAdmin, reactivateAdmin };
