const crypto = require('crypto');

const API_URL = 'https://pay.chargily.net/api/v2';

/**
 * Create a Chargily Pay hosted checkout.
 * Returns the full checkout object from the API (includes checkout_url).
 */
async function createCheckout({
  amount,
  currency = 'DZD',
  description = '',
  metadata = {},
  successUrl,
  failureUrl,
  webhookEndpoint,
  locale = 'ar',
}) {
  const secretKey = process.env.CHARGILY_SECRET_KEY;
  if (!secretKey) throw new Error('CHARGILY_SECRET_KEY not configured');

  const payload = { amount, currency, description, locale, success_url: successUrl, failure_url: failureUrl, metadata };
  if (webhookEndpoint) payload.webhook_endpoint = webhookEndpoint;

  const res = await fetch(`${API_URL}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Chargily error ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Fetch a checkout by ID from the Chargily API.
 */
async function getCheckout(checkoutId) {
  const secretKey = process.env.CHARGILY_SECRET_KEY;
  if (!secretKey) throw new Error('CHARGILY_SECRET_KEY not configured');

  const res = await fetch(`${API_URL}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Chargily error ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

/**
 * Verify the HMAC-SHA256 signature sent by Chargily in the 'Signature' header.
 * rawBody must be the raw Buffer from express.raw() — never a parsed object.
 */
function verifyWebhookSignature(rawBody, signature) {
  const secretKey = process.env.CHARGILY_SECRET_KEY;
  if (!secretKey || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = { createCheckout, getCheckout, verifyWebhookSignature };
