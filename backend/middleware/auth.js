const { auth, db } = require('../config/firebase');

/**
 * Verify Firebase ID token. Attaches decoded token to req.user.
 */
const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Authentication required.' });
  }

  try {
    req.user = await auth.verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ code: 'unauthenticated', message: 'Invalid or expired token.' });
  }
};

/**
 * After verifyToken: confirm the caller is an admin and is strictly bound to the
 * branch they are operating on. The caller's own branch is resolved from the
 * `admins` collection (or branch-level role/email lists) and attached to
 * req.adminBranchId so route handlers can enforce per-document branch isolation
 * (used by endpoints that address a resource by id and have no branchId in body).
 *
 * Any request that carries a branchId (body or query) MUST match the admin's own
 * branch exactly — an admin can never act on another branch.
 */
const requireAdmin = async (req, res, next) => {
  const uid      = req.user?.uid;
  const email    = req.user?.email || '';
  const branchId = req.body?.branchId || req.query?.branchId || '';

  if (!uid) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Authentication required.' });
  }

  try {
    const adminBranchId = await resolveAdminBranch(uid, email, branchId);
    if (!adminBranchId) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }
    // Strict branch binding: a request-supplied branchId must equal the admin's branch.
    if (branchId && branchId !== adminBranchId) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }
    req.adminBranchId = adminBranchId;
    next();
  } catch {
    return res.status(403).json({ code: 'permission-denied', message: 'Could not verify admin access.' });
  }
};

/**
 * Resolve the branch this caller is an admin of, or null if they are not an admin.
 * The global `admins` doc is authoritative and carries the admin's assigned
 * branchId; branch-level fallbacks are only consulted for the explicitly
 * requested branch (and therefore can never grant cross-branch access).
 */
async function resolveAdminBranch(uid, email, requestedBranchId) {
  // 1. Global admins collection — authoritative, bound to a single branchId.
  try {
    const snap = await db.collection('admins').doc(uid).get();
    if (snap.exists) {
      return snap.data()?.branchId || null;
    }
  } catch {}

  // Branch-level fallbacks can only be checked against a concrete branch.
  if (!requestedBranchId) return null;

  // 2. Branch meta/info adminEmails list (scoped to requestedBranchId).
  try {
    const meta = await db.collection('branches').doc(requestedBranchId).collection('meta').doc('info').get();
    if (meta.exists) {
      const list = (meta.data()?.adminEmails || []).map(e => e.toLowerCase());
      if (list.includes(email.toLowerCase())) return requestedBranchId;
    }
  } catch {}

  // 3. Branch user with role=admin (scoped to requestedBranchId).
  try {
    const userSnap = await db.collection('branches').doc(requestedBranchId).collection('users').doc(uid).get();
    if (userSnap.exists && (userSnap.data()?.role || '').toLowerCase() === 'admin') return requestedBranchId;
  } catch {}

  return null;
}

/**
 * Boolean admin check strictly bound to a branch: the caller must be an admin
 * AND assigned to `branchId`. Requires a concrete branchId.
 */
async function isAdmin(uid, email, branchId) {
  if (!branchId) return false;
  return (await resolveAdminBranch(uid, email, branchId)) === branchId;
}

module.exports = { verifyToken, requireAdmin, isAdmin };
