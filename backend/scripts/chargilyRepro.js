/**
 * chargilyRepro.js — isolate the Chargily 422 by driving the REAL
 * services/chargilyService.createCheckout through one payload variable at a time.
 *
 * Each variant changes exactly ONE ingredient vs the known-good control, so the
 * first variant that 422s names the offending field via Chargily's own response
 * body. This reproduces STRUCTURAL rejections (amount type, metadata shape, field
 * names, serialization) deterministically — they validate identically in test and
 * live mode, so a test_sk_ key reproduces them with ZERO live-account impact.
 *
 *   cd backend
 *   # STRONGLY RECOMMENDED: put a test_sk_ key in .env first (auto-routes to
 *   # the /test endpoint — no real checkouts are created in your live dashboard).
 *   node scripts/chargilyRepro.js
 *
 * Creating a checkout never charges anyone (payment only happens if a human
 * completes the hosted page), but a live key still writes a throwaway checkout
 * into your live Chargily dashboard. Prefer a test key.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createCheckout, resolveApi, maskKey } = require('../services/chargilyService');

// The exact production redirect URLs the app builds (FRONTEND_URL = prod).
const PROD_SUCCESS = 'https://trustschoolamara.com/payment/status?orderId=REPRO123&result=success';
const PROD_FAILURE = 'https://trustschoolamara.com/payment/status?orderId=REPRO123&result=failure';
// The exact metadata OBJECT the app sends (controller passes this shape).
const APP_METADATA_OBJECT = { orderId: 'REPRO123', studentId: 'u_test', branchId: 'b_test', serviceType: 'support' };

// One row = one hypothesis. Only the field under test differs from the control.
// Round 2: feed Chargily the EXACT success_url strings that a misconfigured
// FRONTEND_URL would generate at runtime — the only remaining way to get an
// "invalid URL" 422, since the correct prod URL (variant B) already returned 2xx.
const VARIANTS = [
  { name: 'B  KNOWN-GOOD: FRONTEND_URL=https://trustschoolamara.com',
    args: { amount: 5000, currency: 'dzd', description: 'repro B', successUrl: PROD_SUCCESS, failureUrl: PROD_FAILURE } },

  { name: 'G  FRONTEND_URL missing scheme  -> "trustschoolamara.com/payment/..."',
    args: { amount: 5000, currency: 'dzd', description: 'repro G',
      successUrl: 'trustschoolamara.com/payment/status?orderId=REPRO123&result=success',
      failureUrl: 'trustschoolamara.com/payment/status?orderId=REPRO123&result=failure' } },

  { name: 'H  FRONTEND_URL unset -> localhost fallback "http://localhost:3000/payment/..."',
    args: { amount: 5000, currency: 'dzd', description: 'repro H',
      successUrl: 'http://localhost:3000/payment/status?orderId=REPRO123&result=success',
      failureUrl: 'http://localhost:3000/payment/status?orderId=REPRO123&result=failure' } },

  { name: 'I  FRONTEND_URL http (non-https) real domain -> "http://trustschoolamara.com/payment/..."',
    args: { amount: 5000, currency: 'dzd', description: 'repro I',
      successUrl: 'http://trustschoolamara.com/payment/status?orderId=REPRO123&result=success' } },

  { name: 'J  FRONTEND_URL with trailing space -> "https://trustschoolamara.com /payment/..."',
    args: { amount: 5000, currency: 'dzd', description: 'repro J',
      successUrl: 'https://trustschoolamara.com /payment/status?orderId=REPRO123&result=success' } },

  { name: 'K  www + missing scheme -> "www.trustschoolamara.com/payment/..."',
    args: { amount: 5000, currency: 'dzd', description: 'repro K',
      successUrl: 'www.trustschoolamara.com/payment/status?orderId=REPRO123&result=success' } },
];

(async () => {
  let api;
  try { api = resolveApi(); }
  catch (e) { console.error('✗ resolveApi:', e.message); process.exit(1); }

  console.log('── Chargily Repro ──────────────────────────────────────────────');
  console.log('secret key :', maskKey(api.secretKey));
  console.log('mode       :', api.mode, '  (test = no live-dashboard artifacts)');
  console.log('base URL   :', api.baseUrl);
  console.log('────────────────────────────────────────────────────────────────');

  const results = [];
  for (const v of VARIANTS) {
    process.stdout.write(`\n[${v.name}]\n`);
    try {
      const co = await createCheckout(v.args);
      console.log(`  ✓ 2xx  id=${co.id}  url=${co.checkout_url}`);
      results.push({ variant: v.name, ok: true });
    } catch (err) {
      console.error(`  ✗ HTTP ${err.status || '(network)'} — ${err.message}`);
      if (err.body) console.error('  full response body:', JSON.stringify(err.body));
      results.push({ variant: v.name, ok: false, status: err.status, body: err.body });
    }
  }

  console.log('\n── Summary ─────────────────────────────────────────────────────');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.variant}${r.ok ? '' : `  (${r.status})`}`);
  console.log('\nThe first ✗ isolates the offending ingredient; its response body');
  console.log('names the exact field Chargily rejected.');
})();
