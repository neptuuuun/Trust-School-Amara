/**
 * Manually activate reserved support subscriptions whose Group Start Month has
 * arrived — the same idempotent sweep the daily + monthly-1st cron jobs run
 * (see services/cronService.js). Use it to recover from a missed cron run or to
 * verify the reservation → active flow end-to-end. Re-running once caught up is
 * a no-op.
 *
 * Usage:
 *   cd backend
 *   node scripts/activate-reservations.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../config/firebase'); // initialise the Admin SDK before the sweep runs
const { activateDueReservations } = require('../services/reservationService');
const { recomputeSupportClassEnrollment } = require('../controllers/registrationController');

(async () => {
  console.log('\nActivating due reservations…\n');
  const result = await activateDueReservations(recomputeSupportClassEnrollment);
  console.log(`Done. scanned=${result.scanned}, activated=${result.activated}, errors=${result.errors.length}`);
  if (result.errors.length) console.error('Errors:', result.errors);
  process.exit(result.errors.length ? 1 : 0);
})().catch((e) => { console.error('Activation failed:', e); process.exit(1); });
