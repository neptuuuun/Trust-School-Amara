/**
 * Audit + actor-identity helpers (frontend).
 *
 * Two responsibilities:
 *  1. buildActor — the single canonical shape for "who did this" provenance fields
 *     ({uid,name,email}) stamped onto entity documents (createdBy/updatedBy/verifiedBy/…).
 *  2. logAdminAction — record an admin action in the immutable `auditLogs` collection.
 *     `auditLogs` is server-write-only (firestore.rules: allow write: if false), so
 *     client-side admin actions are logged by POSTing to /api/ledger/audit, where the
 *     backend resolves the actor authoritatively (by name) and writes via the Admin SDK.
 *
 * Logging is ALWAYS best-effort: an audit failure must never break the action that
 * triggered it, so logAdminAction never throws.
 */

import apiCall from '../utils/apiClient';

/**
 * Canonical actor for entity provenance fields.
 * @param {object} adminData - the admin doc held in AuthContext (carries name)
 * @returns {{uid:string, name:string, email:string}}
 */
export const buildActor = (adminData = {}) => ({
  uid:   adminData?.uid || adminData?.id || '',
  name:  adminData?.name || '',
  email: adminData?.email || '',
});

/**
 * Record an admin action. Fire-and-forget.
 *
 * @param {object} entry
 * @param {string} entry.action      dot-notation action, e.g. 'group.create', 'document.approve'
 * @param {string} entry.branchId
 * @param {string} [entry.targetType] e.g. 'class' | 'subject' | 'announcement' | 'languageRegistration'
 * @param {string} [entry.targetId]
 * @param {object} [entry.before]    prior state snapshot (optional)
 * @param {object} [entry.after]     new state snapshot (optional)
 * @param {string} [entry.reason]
 * @returns {Promise<void>}
 */
/**
 * Fetch the full audit history of ONE entity (newest → oldest), for the
 * record-level History Panel. Owner sees any branch; an admin is restricted to
 * their own branch (enforced server-side). `branchId` is required for admins.
 *
 * @param {object} p
 * @param {string} p.targetId
 * @param {string} [p.targetType]
 * @param {string} [p.branchId]
 * @param {number} [p.limit]
 * @returns {Promise<{targetId, targetType, count, entries:Array}>}
 */
export const getEntityHistory = async ({ targetType, targetId, branchId, limit } = {}) => {
  const sp = new URLSearchParams();
  if (targetType) sp.append('targetType', targetType);
  if (targetId)   sp.append('targetId', targetId);
  if (branchId)   sp.append('branchId', branchId);
  if (limit)      sp.append('limit', String(limit));
  return apiCall(`/api/audit/history?${sp.toString()}`);
};

export const logAdminAction = async (entry = {}) => {
  if (!entry.action) return;
  try {
    await apiCall('/api/ledger/audit', {
      method: 'POST',
      body: JSON.stringify({
        action:     entry.action,
        branchId:   entry.branchId || null,
        targetType: entry.targetType || null,
        targetId:   entry.targetId || null,
        before:     entry.before ?? null,
        after:      entry.after ?? null,
        reason:     entry.reason ?? null,
      }),
    });
  } catch (e) {
    // Never block the underlying action on a logging failure.
    console.warn('[audit] logAdminAction failed:', e?.message || e);
  }
};
