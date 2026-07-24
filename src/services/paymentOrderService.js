import apiCall from '../utils/apiClient';

/**
 * Create a Chargily checkout for online payment.
 * Returns { orderId, checkoutUrl }.
 */
export async function createChargilyCheckout({ branchId, serviceType, serviceData, amount }) {
  return apiCall('/api/chargily/checkout', {
    method: 'POST',
    body: JSON.stringify({ branchId, serviceType, serviceData, amount }),
  });
}

/**
 * Fetch the current status of a payment order.
 * Returns { orderId, status, registrationId, ... }
 */
export async function getPaymentOrderStatus(orderId) {
  return apiCall(`/api/chargily/order/${orderId}`);
}

/**
 * Manually verify a checkout against Chargily and trigger registration creation
 * if payment was confirmed. Used as a fallback when the webhook fires after the
 * student has already returned to the site.
 * Returns { status, registrationId }
 */
export async function verifyPaymentOrder(orderId) {
  return apiCall(`/api/chargily/verify/${orderId}`, { method: 'POST' });
}
