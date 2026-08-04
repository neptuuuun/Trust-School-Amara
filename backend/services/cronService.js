const cron = require('node-cron');
const { runDailyExpiryCheck } = require('./expiryCheckService');
const { processLifecycle }    = require('./lifecycleService');
const { activateDueReservations } = require('./reservationService');
const { recomputeSupportClassEnrollment } = require('../controllers/registrationController');
const { generateWeeklyReport } = require('./weeklyReportService');

// Flip every reserved support subscription whose Group Start Month has arrived
// to active (idempotent). Recomputes the affected classes' active/reserved
// counters. Shared by the daily and the monthly-1st jobs so a missed run always
// self-heals on the next tick.
async function runReservationActivation(tag) {
  try {
    const r = await activateDueReservations(recomputeSupportClassEnrollment);
    console.log(`[cron] ${tag} reservation activation done`, r);
  } catch (err) {
    console.error(`[cron] ${tag} reservation activation failed`, err.message);
  }
}

function startCronJobs() {
  // Daily at 06:00 Africa/Algiers (UTC+1, no DST) → UTC 05:00
  cron.schedule('0 5 * * *', async () => {
    console.log('[cron] running daily expiry check');
    try {
      const result = await runDailyExpiryCheck();
      console.log('[cron] expiry check done', result);
    } catch (err) {
      console.error('[cron] expiry check failed', err.message);
    }
    // Belt-and-suspenders: catch any reservation whose start month began without
    // the monthly-1st job (e.g. a missed/failed run) — activation is idempotent.
    await runReservationActivation('daily');
  });

  // Monthly on 1st at 02:00 Africa/Algiers → UTC 01:00
  cron.schedule('0 1 1 * *', async () => {
    // The 1st is exactly when Start Months begin → activate reservations FIRST,
    // then run the account lifecycle sweep.
    await runReservationActivation('monthly');

    console.log('[cron] running monthly lifecycle processing');
    try {
      const result = await processLifecycle(false);
      console.log('[cron] lifecycle done', result);
    } catch (err) {
      console.error('[cron] lifecycle failed', err.message);
    }
  });

  // Weekly on Saturday at 07:00 Africa/Algiers (UTC+1) → UTC 06:00. Saturday is the
  // start of the Algerian work week, so the report summarises the week just ended.
  cron.schedule('0 6 * * 6', async () => {
    console.log('[cron] generating weekly owner report');
    try {
      const report = await generateWeeklyReport({ persist: true });
      console.log('[cron] weekly report done', report.id);
    } catch (err) {
      console.error('[cron] weekly report failed', err.message);
    }
  });

  console.log('[cron] jobs registered: daily expiry check + reservation activation + monthly lifecycle + weekly owner report');
}

module.exports = { startCronJobs };
