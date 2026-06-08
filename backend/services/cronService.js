const cron = require('node-cron');
const { runDailyExpiryCheck } = require('./expiryCheckService');
const { processLifecycle }    = require('./lifecycleService');

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
  });

  // Monthly on 1st at 02:00 Africa/Algiers → UTC 01:00
  cron.schedule('0 1 1 * *', async () => {
    console.log('[cron] running monthly lifecycle processing');
    try {
      const result = await processLifecycle(false);
      console.log('[cron] lifecycle done', result);
    } catch (err) {
      console.error('[cron] lifecycle failed', err.message);
    }
  });

  console.log('[cron] jobs registered: daily expiry check + monthly lifecycle');
}

module.exports = { startCronJobs };
