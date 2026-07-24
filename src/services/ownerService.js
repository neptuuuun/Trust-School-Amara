import apiCall from '../utils/apiClient';

/**
 * Owner analytics client — thin authed wrappers over the owner-only backend
 * (`/api/owner/*`, requireOwner). All endpoints are cross-branch and read-only.
 *
 * `month` is an optional 'YYYY-MM' string; omit for the current month.
 */

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') sp.append(k, v); });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** Executive summary cards + trend deltas. */
export const getOwnerSummary = (month) =>
  apiCall(`/api/owner/summary${qs({ month })}`);

/** Per-branch analytics for side-by-side comparison. */
export const getOwnerBranches = (month) =>
  apiCall(`/api/owner/branches${qs({ month })}`);

/** Revenue grouped by service type → subject (optionally for one branch). */
export const getOwnerRevenue = ({ month, branchId } = {}) =>
  apiCall(`/api/owner/revenue${qs({ month, branchId })}`);

/** Per-group (class) analytics: expected vs actual, retention, discrepancies. */
export const getOwnerGroups = ({ month, branchId } = {}) =>
  apiCall(`/api/owner/groups${qs({ month, branchId })}`);

/** Per-branch support-level (دروس الدعم) snapshot: weak students, assigned/waiting,
 *  low-level group count + occupancy. */
export const getOwnerSupportOverview = ({ branchId } = {}) =>
  apiCall(`/api/owner/support-overview${qs({ branchId })}`);

/** Monthly retention cohorts (start/joined/left/remaining + rates). */
export const getOwnerRetention = ({ month, months, branchId } = {}) =>
  apiCall(`/api/owner/retention${qs({ month, months, branchId })}`);

/** Student lifecycle list (status, last payment, history) with optional report. */
export const getOwnerStudents = ({ branchId, status, report } = {}) =>
  apiCall(`/api/owner/students${qs({ branchId, status, report })}`);

/** Per-teacher performance (groups, students, revenue, retention, growth). */
export const getOwnerTeachers = ({ month, branchId } = {}) =>
  apiCall(`/api/owner/teachers${qs({ month, branchId })}`);

/** Per-admin activity stats derived from the audit log. */
export const getOwnerAdminActivity = ({ branchId, days } = {}) =>
  apiCall(`/api/owner/admin-activity${qs({ branchId, days })}`);

/** Audit-log viewer entries (filters: branch, action, actor, date window). */
export const getOwnerAuditLog = ({ branchId, action, actorUid, days, limit } = {}) =>
  apiCall(`/api/owner/audit${qs({ branchId, action, actorUid, days, limit })}`);

/** Alerts engine: revenue drops, collection shortfalls, retention/churn, sensitive audits. */
export const getOwnerAlerts = ({ month, branchId } = {}) =>
  apiCall(`/api/owner/alerts${qs({ month, branchId })}`);

// ── Admin management (owner-only; the ONLY way admin accounts are managed) ───────
// Each call is audit-logged server-side with the acting owner as the actor.

/** List every admin account (uid, name, email, branch, active, lastActivityAt, …). */
export const listOwnerAdmins = () =>
  apiCall('/api/owner/admins');

/** Create an individual admin (employee) account. password is required for a brand-new login. */
export const createOwnerAdmin = ({ email, name, branchId, password } = {}) =>
  apiCall('/api/owner/admins', { method: 'POST', body: JSON.stringify({ email, name, branchId, password }) });

/** Deactivate an admin — revokes Firestore access AND disables their Auth login. */
export const deactivateOwnerAdmin = (uid) =>
  apiCall(`/api/owner/admins/${uid}/deactivate`, { method: 'PATCH', body: JSON.stringify({}) });

/** Reactivate a previously deactivated admin. */
export const reactivateOwnerAdmin = (uid) =>
  apiCall(`/api/owner/admins/${uid}/reactivate`, { method: 'PATCH', body: JSON.stringify({}) });

// ── Financial settings (owner-only) ──────────────────────────────────────────

/** Current finance settings: { settings: { annualFeeAmount, currency, updatedAt, updatedBy, isDefault } }. */
export const getOwnerSettings = () =>
  apiCall('/api/owner/settings');

/** Set the global annual fee amount (DZD). Affects FUTURE payments only. */
export const setOwnerAnnualFee = (amount) =>
  apiCall('/api/owner/annual-fee', { method: 'PATCH', body: JSON.stringify({ amount }) });
