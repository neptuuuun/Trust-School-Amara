const crypto = require('crypto');

// ── Chargily Pay v2 base URLs ────────────────────────────────────────────────
// v2 uses SEPARATE endpoints per mode. A test secret key (test_sk_…) is valid
// ONLY on the /test/ endpoint; a live key (live_sk_…) only on the production
// endpoint. Sending a test key to the live URL (or vice-versa) returns
// HTTP 401 {"message":"Unauthenticated."} — the credential is rejected because
// it doesn't belong to that endpoint, NOT because the key is wrong.
//   Docs: https://dev.chargily.com/pay-v2/test-and-live-mode
const LIVE_API_URL = 'https://pay.chargily.net/api/v2';
const TEST_API_URL = 'https://pay.chargily.net/test/api/v2';

// Set CHARGILY_DEBUG=1 in the backend env to log the final URL, masked headers,
// HTTP status, and full response body for every Chargily request.
const DEBUG = process.env.CHARGILY_DEBUG === '1' || process.env.CHARGILY_DEBUG === 'true';

function maskKey(key) {
  if (!key) return '(none)';
  const prefix = (key.match(/^(live_sk_|test_sk_|live_pk_|test_pk_)/) || [])[0] || key.slice(0, 4);
  return `${prefix}******** (length: ${key.length})`;
}

/**
 * Resolve the secret key + the base URL that key is valid on. The endpoint is
 * chosen from the key prefix, so switching test↔live is a pure .env change.
 */
function resolveApi() {
  const secretKey = process.env.CHARGILY_SECRET_KEY;
  if (!secretKey) throw new Error('CHARGILY_SECRET_KEY not configured');
  const isTest  = secretKey.startsWith('test_');
  const baseUrl = isTest ? TEST_API_URL : LIVE_API_URL;
  return { secretKey, baseUrl, mode: isTest ? 'test' : 'live' };
}

/**
 * Shared request helper — attaches auth, logs (when DEBUG), and turns any
 * non-2xx into an Error carrying the status + full response body.
 */
async function chargilyFetch(path, { method = 'GET', body, secretKey, baseUrl } = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (DEBUG) {
    console.log('[chargily] →', method, url);
    console.log('[chargily]   headers:', { ...headers, Authorization: `Bearer ${maskKey(secretKey)}` });
    if (body !== undefined) console.log('[chargily]   body:', JSON.stringify(body));
  }

  const res  = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (DEBUG || !res.ok) {
    console[res.ok ? 'log' : 'error'](`[chargily] ← HTTP ${res.status} ${method} ${url}`);
    console[res.ok ? 'log' : 'error']('[chargily]   response body:', text);
  }

  if (!res.ok) {
    const err = new Error(`Chargily error ${res.status}: ${data.message || text || 'unknown'}`);
    err.status = res.status;
    err.body   = data;
    throw err;
  }
  return data;
}

/**
 * Create a Chargily Pay hosted checkout.
 * Returns the full checkout object from the API (includes checkout_url).
 */
async function createCheckout({
  amount,
  currency = 'dzd',
  description = '',
  metadata = {},
  successUrl,
  failureUrl,
  webhookEndpoint,
  locale = 'ar',
}) {
  const { secretKey, baseUrl } = resolveApi();

  const payload = { amount, currency, description, locale, success_url: successUrl, failure_url: failureUrl, metadata };
  if (webhookEndpoint) payload.webhook_endpoint = webhookEndpoint;

  // ═══ TEMP DEBUG — remove after diagnosing the Chargily 422 ═══════════════════
  // This is the EXACT object about to be JSON.stringified and POSTed to Chargily
  // (the bytes that leave the backend). Nothing between here and the wire mutates it.
  console.log("========== CHARGILY REQUEST ==========");
  console.log({
    env_FRONTEND_URL: process.env.FRONTEND_URL,
    env_BACKEND_URL:  process.env.BACKEND_URL,
    endpoint:         `${baseUrl}/checkouts`,
    mode:             secretKey.startsWith('test_') ? 'test' : 'live',
    success_url:      payload.success_url,
    failure_url:      payload.failure_url,
    webhook_endpoint: payload.webhook_endpoint,
    amount:           payload.amount,
    amount_type:      typeof payload.amount,
    amount_isInteger: Number.isInteger(payload.amount),
    currency:         payload.currency,
    metadata:         payload.metadata,
    metadata_kind:    Array.isArray(payload.metadata) ? 'array' : typeof payload.metadata,
  });
  console.log("serialized body:", JSON.stringify(payload));
  console.log("======================================");
  // ═══ END TEMP DEBUG ══════════════════════════════════════════════════════════

  return chargilyFetch('/checkouts', { method: 'POST', body: payload, secretKey, baseUrl });
}

/**
 * Fetch a checkout by ID from the Chargily API.
 */
async function getCheckout(checkoutId) {
  const { secretKey, baseUrl } = resolveApi();
  return chargilyFetch(`/checkouts/${checkoutId}`, { method: 'GET', secretKey, baseUrl });
}

/**
 * Fetch the account balance — a cheap authenticated endpoint, handy as a
 * connectivity/credential health check on boot or from a diagnostic script.
 */
async function getBalance() {
  const { secretKey, baseUrl } = resolveApi();
  return chargilyFetch('/balance', { method: 'GET', secretKey, baseUrl });
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

module.exports = { createCheckout, getCheckout, getBalance, verifyWebhookSignature, resolveApi, maskKey };
