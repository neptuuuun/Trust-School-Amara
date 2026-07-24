/**
 * adminOpsService — the admin dashboard's operational (non-catalog) API surface.
 *
 * Everything here is branch-scoped SERVER-SIDE: the backend resolves the caller's
 * branch from the `admins` collection and refuses any request carrying a different
 * branchId, so the client never needs to (and must not) pass one.
 */

import apiCall from '../utils/apiClient';

/**
 * One round-trip snapshot of the branch's outstanding work.
 * @returns {Promise<{
 *   branchId: string, academicYear: string, generatedAt: string,
 *   actionRequired: { documentVerification: number, stuckPayments: number, trainingRequests: number, total: number },
 *   stuckPaymentsList: Array<object>,
 *   students: { total: number, verified: number, pendingDocs: number, other: number },
 *   revenue: { today: number, month: number, paidOrdersToday: number, awaitingPayment: number, window: number },
 *   support: { active: number, expiringSoon: number, expired: number, expiringList: Array<object> },
 *   catalog: { subjects: object, classes: number, classesFull: number, seatsFree: number },
 *   annualFees: { paidThisYear: number },
 * }>}
 */
export const getAdminOverview = () => apiCall('/api/admin/overview');

/**
 * Payment orders for the admin's branch, with a branch-wide summary that is
 * independent of the applied filter.
 * @param {{ status?: string, needsAttention?: boolean, limit?: number }} opts
 */
export const getPaymentOrders = ({ status, needsAttention, limit = 200 } = {}) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (needsAttention) params.set('needsAttention', 'true');
  else if (status && status !== 'all') params.set('status', status);
  return apiCall(`/api/chargily/orders?${params.toString()}`);
};

/**
 * Close the operational alert on a paid-but-unseated order after handling it
 * (seated manually, refunded, or moved to another group). Does not touch money.
 */
export const resolveStuckPaymentOrder = (orderId, note = '') =>
  apiCall(`/api/admin/payment-orders/${encodeURIComponent(orderId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
