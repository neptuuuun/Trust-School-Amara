/**
 * chargilyDoctor.js — standalone Chargily credential/endpoint health check.
 *
 * Loads backend/.env exactly like the server does, resolves the endpoint from the
 * key prefix, and exercises two authenticated calls (GET /balance, POST
 * /checkouts). Proves — independently of the app — whether auth succeeds.
 *
 *   Run from the backend/ directory:  node scripts/chargilyDoctor.js
 */
const path = require('path');
// Load the SAME .env the server loads (backend/.env), regardless of cwd.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getBalance, createCheckout, resolveApi, maskKey } = require('../services/chargilyService');

(async () => {
  console.log('── Chargily Doctor ─────────────────────────────────────────────');
  console.log('dotenv loaded from:', path.join(__dirname, '..', '.env'));

  let api;
  try {
    api = resolveApi();
  } catch (e) {
    console.error('✗', e.message);
    process.exit(1);
  }
  console.log('secret key       :', maskKey(api.secretKey));
  console.log('resolved mode    :', api.mode);
  console.log('resolved base URL:', api.baseUrl);
  console.log('────────────────────────────────────────────────────────────────');

  try {
    console.log('\n[1] GET /balance …');
    const bal = await getBalance();
    console.log('✓ authenticated. livemode =', bal.livemode, '| wallets:', (bal.wallets || []).map(w => w.currency).join(', '));

    console.log('\n[2] POST /checkouts (throwaway) …');
    const co = await createCheckout({
      amount: 5000,
      currency: 'dzd',
      description: 'chargilyDoctor connectivity test',
      successUrl: 'https://example.com/ok',
    });
    console.log('✓ checkout created. id =', co.id, '| url =', co.checkout_url);
    console.log('\n✅ Chargily authentication is WORKING.');
  } catch (err) {
    console.error('\n✗ HTTP', err.status || '(network)', '—', err.message);
    if (err.body) console.error('  full body:', JSON.stringify(err.body));
    console.error('\n❌ Chargily authentication FAILED (see above).');
    process.exit(1);
  }
})();
